import { db } from "@/lib/db";
import { DEFAULT_AI_MODEL, isModelAvailable } from "@/lib/ai-models";
import { runBookGeneration } from "@/lib/book-generator/streaming";
import { type Plan } from "@/generated/prisma/client";

const MAX_CONCURRENT_GENERATIONS = 2;

const PLAN_PRIORITY: Record<Plan, number> = {
  FREE: 1,
  PRO: 2,
  ENTERPRISE: 3,
};

const activeBookIds = new Set<string>();
const cancellationRequests = new Set<string>();

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

export async function ensureGenerationRunning(
  bookId: string,
  userId: string,
  resume = false
) {
  const STALE_MS = 10 * 60 * 1000;
  const staleBefore = new Date(Date.now() - STALE_MS);

  const result = await db.$transaction(async (tx) => {
    const book = await tx.book.findUniqueOrThrow({
      where: { id: bookId, userId },
      include: { user: true },
    });

    if (book.status === "COMPLETED") {
      return { action: "completed" as const };
    }

    // Fail stale running jobs so recovery can happen after a crash.
    await tx.generationJob.updateMany({
      where: {
        bookId,
        status: "RUNNING",
        createdAt: { lt: staleBefore },
      },
      data: {
        status: "FAILED",
        error: "Stale job",
        completedAt: new Date(),
      },
    });

    const activeJob = await tx.generationJob.findFirst({
      where: { bookId, status: { in: ["QUEUED", "RUNNING"] } },
      orderBy: { createdAt: "desc" },
    });

    if (activeJob) {
      return { action: "already-running" as const, jobId: activeJob.id };
    }

    if (book.status === "PAUSED" && !resume) {
      return { action: "paused" as const };
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
      await tx.book.update({
        where: { id: bookId },
        data: { status: "DRAFT", errorMessage: null },
      });
    }

    const job = await tx.generationJob.create({
      data: {
        bookId,
        type: "FULL_BOOK",
        status: "QUEUED",
        priority: PLAN_PRIORITY[book.user.plan] ?? 1,
      },
    });

    // Show the book as generating in the UI even when it is only queued.
    await tx.book.update({
      where: { id: bookId },
      data: { status: "GENERATING" },
    });

    return { action: "queued" as const, jobId: job.id };
  });

  if (result.action === "completed") {
    return { queued: false, alreadyRunning: false, completed: true };
  }

  if (result.action === "paused") {
    throw new GenerationPausedError();
  }

  if (result.action === "already-running") {
    return { queued: false, alreadyRunning: true, jobId: result.jobId };
  }

  // Try to start the next job in the queue immediately. If the slots are full,
  // processQueue will no-op and the pending job waits until a slot frees up.
  void processQueue();
  return { queued: true, alreadyRunning: false, jobId: result.jobId };
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

let workerPromise: Promise<void> | null = null;

async function processQueue() {
  if (activeBookIds.size >= MAX_CONCURRENT_GENERATIONS) return;

  if (workerPromise) return;
  workerPromise = processQueueInner().finally(() => {
    workerPromise = null;
  });
  return workerPromise;
}

async function processQueueInner() {
  while (activeBookIds.size < MAX_CONCURRENT_GENERATIONS) {
    const job = await db.$transaction(async (tx) => {
      const candidate = await tx.generationJob.findFirst({
        where: { status: "QUEUED" },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        include: { book: { select: { userId: true } } },
      });

      if (!candidate) return null;

      // Claim the job only if it is still queued.
      const claimed = await tx.generationJob
        .update({
          where: { id: candidate.id, status: "QUEUED" },
          data: { status: "RUNNING", startedAt: new Date() },
        })
        .catch(() => null);

      return claimed
        ? {
            id: claimed.id,
            bookId: claimed.bookId,
            userId: candidate.book.userId,
          }
        : null;
    });

    if (!job) break;

    void runQueuedJob(job.id, job.bookId, job.userId);
  }
}

// Safety net: periodically scan for orphaned queued jobs in case the chain of
// processQueue() triggers is broken by a server restart or deploy.
setInterval(() => {
  void processQueue();
}, 5000);
