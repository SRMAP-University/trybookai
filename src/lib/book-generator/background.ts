import { db } from "@/lib/db";
import { DEFAULT_AI_MODEL, isModelAvailable } from "@/lib/ai-models";
import { runBookGeneration } from "@/lib/book-generator/streaming";
import {
  enqueueCloudflareGeneration,
  getGenerationRunner,
} from "@/lib/book-generator/cloudflare-enqueue";
import { type Plan } from "@/generated/prisma/client";

const MAX_CONCURRENT_GENERATIONS = 2;
const QUEUE_POLL_MS = 15_000;
/** Re-queue RUNNING jobs with no heartbeat after this many ms (CF worker). */
export const STALE_RUNNING_MS = 15 * 60 * 1000;
/** Re-enqueue QUEUED jobs that were never claimed. */
export const STALE_QUEUED_MS = 10 * 60 * 1000;

const PLAN_PRIORITY: Record<Plan, number> = {
  FREE: 1,
  PRO: 2,
  ENTERPRISE: 3,
  UNLIMITED: 4,
};

const globalQueue = globalThis as unknown as {
  bookaiActiveBookIds?: Set<string>;
  bookaiCancellationRequests?: Set<string>;
  bookaiWorkerPromise?: Promise<void> | null;
  bookaiQueueInterval?: ReturnType<typeof setInterval> | null;
};

const activeBookIds =
  globalQueue.bookaiActiveBookIds ?? new Set<string>();
const cancellationRequests =
  globalQueue.bookaiCancellationRequests ?? new Set<string>();

globalQueue.bookaiActiveBookIds = activeBookIds;
globalQueue.bookaiCancellationRequests = cancellationRequests;

export class GenerationCancelledError extends Error {
  constructor(message = "Generation cancelled") {
    super(message);
    this.name = "GenerationCancelledError";
  }
}

export function requestGenerationCancellation(bookId: string) {
  cancellationRequests.add(bookId);
}

export function isGenerationCancellationRequested(bookId: string) {
  return cancellationRequests.has(bookId);
}

export function clearGenerationCancellation(bookId: string) {
  cancellationRequests.delete(bookId);
}

export async function validateGenerationEligibility(
  bookId: string,
  userId: string
) {
  const book = await db.book.findUniqueOrThrow({
    where: { id: bookId, userId },
    include: { user: true },
  });

  if (book.status === "COMPLETED") {
    return { book, canStart: false, reason: "completed" as const };
  }

  const remaining = book.user.pagesLimit - book.user.pagesUsed;
  if (book.targetPages > remaining) {
    throw new Error(
      `Insufficient page credits. You have ${remaining} pages remaining.`
    );
  }

  if (!isModelAvailable(book.model || DEFAULT_AI_MODEL, book.user.plan)) {
    throw new Error("This model requires a Pro or Enterprise plan.");
  }

  return { book, canStart: true, reason: null };
}

export function isGenerationActive(bookId: string) {
  return activeBookIds.has(bookId);
}

export class GenerationPausedError extends Error {
  constructor(message = "Generation is paused") {
    super(message);
    this.name = "GenerationPausedError";
  }
}

function isTransientDbError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /P2028|Unable to start a transaction|Connection terminated|connection timeout|ECONNRESET|ETIMEDOUT|too many clients/i.test(
    message
  );
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function failJobAndBook(
  jobId: string,
  bookId: string,
  error: string
) {
  await db.generationJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      error: error.slice(0, 2000),
      completedAt: new Date(),
    },
  });
  await db.book.updateMany({
    where: {
      id: bookId,
      status: { notIn: ["PAUSED", "COMPLETED"] },
    },
    data: {
      status: "FAILED",
      errorMessage: error.slice(0, 2000),
    },
  });
}

export type GenerationSweepResult = {
  staleRunningRequeued: number;
  staleRunningFailed: number;
  staleQueuedReenqueued: number;
  orphanBooksFailed: number;
  forceEnqueued: number;
  errors: string[];
};

/**
 * Recover stale RUNNING/QUEUED jobs and orphan GENERATING books.
 * Used by ensureGenerationRunning and the generation-sweep cron.
 */
export async function recoverStaleGenerationJobs(options?: {
  bookId?: string;
  /** When true, force-restart CF workflows for requeued jobs. */
  forceRestart?: boolean;
}): Promise<GenerationSweepResult> {
  const bookId = options?.bookId;
  const forceRestart = options?.forceRestart ?? true;
  const runner = getGenerationRunner();
  const result: GenerationSweepResult = {
    staleRunningRequeued: 0,
    staleRunningFailed: 0,
    staleQueuedReenqueued: 0,
    orphanBooksFailed: 0,
    forceEnqueued: 0,
    errors: [],
  };

  const staleRunningBefore = new Date(Date.now() - STALE_RUNNING_MS);
  const staleQueuedBefore = new Date(Date.now() - STALE_QUEUED_MS);

  const staleRunning = await db.generationJob.findMany({
    where: {
      ...(bookId ? { bookId } : {}),
      status: "RUNNING",
      updatedAt: { lt: staleRunningBefore },
    },
    include: { book: { select: { userId: true } } },
    take: 50,
  });

  for (const job of staleRunning) {
    try {
      if (job.attempts >= job.maxAttempts) {
        await failJobAndBook(
          job.id,
          job.bookId,
          `Generation stalled after ${job.attempts} attempts. Please resume to try again.`
        );
        result.staleRunningFailed++;
        continue;
      }

      await db.generationJob.update({
        where: { id: job.id },
        data: {
          status: "QUEUED",
          error: "Stale RUNNING job — re-queued for worker",
          startedAt: null,
        },
      });
      result.staleRunningRequeued++;

      if (runner === "cloudflare") {
        await enqueueCloudflareGeneration({
          bookId: job.bookId,
          userId: job.book.userId,
          jobId: job.id,
          force: forceRestart,
        });
        result.forceEnqueued++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`staleRunning ${job.id}: ${message.slice(0, 200)}`);
    }
  }

  const staleQueued = await db.generationJob.findMany({
    where: {
      ...(bookId ? { bookId } : {}),
      status: "QUEUED",
      updatedAt: { lt: staleQueuedBefore },
    },
    include: { book: { select: { userId: true, status: true } } },
    take: 50,
  });

  for (const job of staleQueued) {
    try {
      if (job.attempts >= job.maxAttempts) {
        await failJobAndBook(
          job.id,
          job.bookId,
          `Generation failed after ${job.attempts} attempts. Please resume to try again.`
        );
        result.staleRunningFailed++;
        continue;
      }

      if (runner === "cloudflare") {
        await enqueueCloudflareGeneration({
          bookId: job.bookId,
          userId: job.book.userId,
          jobId: job.id,
          force: forceRestart,
        });
        result.staleQueuedReenqueued++;
        result.forceEnqueued++;
      } else {
        void processQueue();
        result.staleQueuedReenqueued++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`staleQueued ${job.id}: ${message.slice(0, 200)}`);
    }
  }

  // Books stuck GENERATING/OUTLINING with no active job.
  const orphanBooks = await db.book.findMany({
    where: {
      ...(bookId ? { id: bookId } : {}),
      status: { in: ["GENERATING", "OUTLINING"] },
      generationJobs: {
        none: { status: { in: ["QUEUED", "RUNNING"] } },
      },
    },
    select: { id: true, userId: true },
    take: 40,
  });

  for (const book of orphanBooks) {
    try {
      await db.book.update({
        where: { id: book.id },
        data: {
          status: "FAILED",
          errorMessage:
            "Generation stopped unexpectedly. Tap Resume to continue.",
        },
      });
      result.orphanBooksFailed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`orphanBook ${book.id}: ${message.slice(0, 200)}`);
    }
  }

  if (runner === "local") {
    void processQueue();
  }

  return result;
}

/** @deprecated Prefer recoverStaleGenerationJobs — kept for call sites. */
async function requeueStaleRunningJobs(bookId?: string) {
  await recoverStaleGenerationJobs({ bookId, forceRestart: true });
}

/** Queue a generation without interactive transactions (Neon-pooler safe). */
export async function ensureGenerationRunning(
  bookId: string,
  userId: string,
  resume = false
) {
  await requeueStaleRunningJobs(bookId);

  const book = await db.book.findUniqueOrThrow({
    where: { id: bookId, userId },
    include: { user: true },
  });

  if (book.status === "COMPLETED") {
    return { queued: false, alreadyRunning: false, completed: true };
  }

  const activeJob = await db.generationJob.findFirst({
    where: { bookId, status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  });

  const runner = getGenerationRunner();

  if (activeJob) {
    if (activeJob.attempts >= activeJob.maxAttempts) {
      await failJobAndBook(
        activeJob.id,
        bookId,
        `Generation failed after ${activeJob.attempts} attempts. Please resume to try again.`
      );
      // Fall through to create a fresh job when resume=true, else stop.
      if (!resume && book.status !== "FAILED" && book.status !== "PAUSED") {
        return {
          queued: false,
          alreadyRunning: false,
          jobId: activeJob.id,
          exhausted: true,
        };
      }
    } else {
      if (runner === "cloudflare") {
        try {
          const staleHint =
            activeJob.error?.includes("Stale RUNNING") ||
            (activeJob.status === "QUEUED" &&
              Date.now() - activeJob.updatedAt.getTime() > STALE_QUEUED_MS);
          await enqueueCloudflareGeneration({
            bookId,
            userId,
            jobId: activeJob.id,
            // Never force-restart a healthy RUNNING workflow on normal resume.
            force: staleHint,
          });
        } catch (error) {
          console.error("[generation] re-enqueue to Cloudflare failed:", error);
        }
      } else {
        void processQueue();
      }
      return { queued: false, alreadyRunning: true, jobId: activeJob.id };
    }
  }

  // Re-check after possible maxAttempts fail above.
  const stillActive = await db.generationJob.findFirst({
    where: { bookId, status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  });
  if (stillActive) {
    return { queued: false, alreadyRunning: true, jobId: stillActive.id };
  }

  const freshBook = await db.book.findUniqueOrThrow({
    where: { id: bookId, userId },
    include: { user: true },
  });

  if (freshBook.status === "PAUSED" && !resume) {
    throw new GenerationPausedError();
  }

  const remaining = freshBook.user.pagesLimit - freshBook.user.pagesUsed;
  if (freshBook.targetPages > remaining) {
    throw new Error(
      `Insufficient page credits. You have ${remaining} pages remaining.`
    );
  }

  if (!isModelAvailable(freshBook.model || DEFAULT_AI_MODEL, freshBook.user.plan)) {
    throw new Error("This model requires a Pro or Enterprise plan.");
  }

  if (freshBook.status === "FAILED" || freshBook.status === "PAUSED") {
    await db.book.update({
      where: { id: bookId },
      data: { status: "DRAFT", errorMessage: null },
    });
  }

  const job = await db.generationJob.create({
    data: {
      bookId,
      type: "FULL_BOOK",
      status: "QUEUED",
      priority: PLAN_PRIORITY[freshBook.user.plan] ?? 1,
    },
  });

  await db.book.update({
    where: { id: bookId },
    data: { status: "GENERATING", errorMessage: null },
  });

  if (runner === "cloudflare") {
    try {
      await enqueueCloudflareGeneration({
        bookId,
        userId,
        jobId: job.id,
      });
    } catch (error) {
      console.error("[generation] enqueue to Cloudflare failed:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to enqueue Cloudflare worker";
      await failJobAndBook(job.id, bookId, message);
      throw error;
    }
  } else {
    void processQueue();
  }

  return { queued: true, alreadyRunning: false, jobId: job.id };
}

async function runQueuedJob(jobId: string, bookId: string, userId: string) {
  activeBookIds.add(bookId);

  try {
    await runBookGeneration(bookId, userId, undefined, jobId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generation failed";
    console.error(`Queued generation failed for book ${bookId}:`, error);
    await db.generationJob
      .update({
        where: { id: jobId },
        data: { status: "FAILED", error: message, completedAt: new Date() },
      })
      .catch(() => undefined);
    await db.book
      .updateMany({
        where: {
          id: bookId,
          status: { notIn: ["PAUSED", "COMPLETED"] },
        },
        data: { status: "FAILED", errorMessage: message.slice(0, 2000) },
      })
      .catch(() => undefined);
  } finally {
    activeBookIds.delete(bookId);
    void processQueue();
  }
}

async function processQueue() {
  if (getGenerationRunner() === "cloudflare") return;
  if (activeBookIds.size >= MAX_CONCURRENT_GENERATIONS) return;

  if (globalQueue.bookaiWorkerPromise) return;
  globalQueue.bookaiWorkerPromise = processQueueInner().finally(() => {
    globalQueue.bookaiWorkerPromise = null;
  });
  return globalQueue.bookaiWorkerPromise;
}

async function claimNextQueuedJob(): Promise<{
  id: string;
  bookId: string;
  userId: string;
} | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const candidate = await db.generationJob.findFirst({
        where: { status: "QUEUED" },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        include: { book: { select: { userId: true } } },
      });

      if (!candidate) return null;

      if (candidate.attempts >= candidate.maxAttempts) {
        await failJobAndBook(
          candidate.id,
          candidate.bookId,
          `Generation failed after ${candidate.attempts} attempts. Please resume to try again.`
        );
        continue;
      }

      if (activeBookIds.has(candidate.bookId)) {
        continue;
      }

      const claimed = await db.generationJob.updateMany({
        where: { id: candidate.id, status: "QUEUED" },
        data: {
          status: "RUNNING",
          startedAt: new Date(),
          attempts: { increment: 1 },
        },
      });

      if (claimed.count === 1) {
        return {
          id: candidate.id,
          bookId: candidate.bookId,
          userId: candidate.book.userId,
        };
      }
    } catch (error) {
      if (isTransientDbError(error) && attempt < 4) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  return null;
}

async function processQueueInner() {
  try {
    while (activeBookIds.size < MAX_CONCURRENT_GENERATIONS) {
      const job = await claimNextQueuedJob();
      if (!job) break;
      void runQueuedJob(job.id, job.bookId, job.userId);
    }
  } catch (error) {
    console.error("[generation queue] processQueue failed:", error);
  }
}

// Local-dev in-process queue only — Cloudflare mode must not start intervals.
if (getGenerationRunner() === "local") {
  if (globalQueue.bookaiQueueInterval) {
    clearInterval(globalQueue.bookaiQueueInterval);
  }
  globalQueue.bookaiQueueInterval = setInterval(() => {
    void processQueue();
  }, QUEUE_POLL_MS);
}
