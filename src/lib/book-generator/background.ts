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
const STALE_RUNNING_MS = 15 * 60 * 1000;

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

async function requeueStaleRunningJobs(bookId?: string) {
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);
  await db.generationJob.updateMany({
    where: {
      ...(bookId ? { bookId } : {}),
      status: "RUNNING",
      updatedAt: { lt: staleBefore },
    },
    data: {
      status: "QUEUED",
      error: "Stale RUNNING job — re-queued for worker",
      startedAt: null,
    },
  });
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
    if (runner === "cloudflare") {
      try {
        await enqueueCloudflareGeneration({
          bookId,
          userId,
          jobId: activeJob.id,
        });
      } catch (error) {
        console.error("[generation] re-enqueue to Cloudflare failed:", error);
      }
    } else {
      void processQueue();
    }
    return { queued: false, alreadyRunning: true, jobId: activeJob.id };
  }

  if (book.status === "PAUSED" && !resume) {
    throw new GenerationPausedError();
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

  if (book.status === "FAILED" || book.status === "PAUSED") {
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
      priority: PLAN_PRIORITY[book.user.plan] ?? 1,
    },
  });

  await db.book.update({
    where: { id: bookId },
    data: { status: "GENERATING" },
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
      await db.generationJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          error:
            error instanceof Error
              ? error.message
              : "Failed to enqueue Cloudflare worker",
          completedAt: new Date(),
        },
      });
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

      if (activeBookIds.has(candidate.bookId)) {
        continue;
      }

      const claimed = await db.generationJob.updateMany({
        where: { id: candidate.id, status: "QUEUED" },
        data: { status: "RUNNING", startedAt: new Date() },
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
