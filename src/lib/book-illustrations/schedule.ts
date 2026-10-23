import { db } from "@/lib/db";
import { postInternal } from "@/lib/internal-call";
import {
  ILLUSTRATION_STALE_MS,
  runBookIllustrations,
} from "@/lib/book-illustrations/runner";

const activeJobs = new Map<string, Promise<void>>();

/** Hand-offs in a row before giving up, so a stuck book can't chain forever. */
const MAX_CHAIN = 8;

export type ScheduleResult = {
  started: boolean;
  /** The job, so a route can keep its function alive with `after(() => task)`. */
  task?: Promise<void>;
};

/**
 * Start illustrating a book on this server unless another server is already
 * on it. Ownership is one conditional update on the book's heartbeat, so two
 * triggers (a push, a page poll) can't both start it. Safe to call often.
 */
export async function scheduleBookIllustrations(
  bookId: string,
  options: { chain?: number } = {}
): Promise<ScheduleResult> {
  const local = activeJobs.get(bookId);
  if (local) return { started: false, task: local };

  const staleBefore = new Date(Date.now() - ILLUSTRATION_STALE_MS);
  const { count } = await db.book.updateMany({
    where: {
      id: bookId,
      includeIllustrations: true,
      OR: [{ illustrationHeartbeatAt: null }, { illustrationHeartbeatAt: { lt: staleBefore } }],
    },
    data: { illustrationHeartbeatAt: new Date() },
  });
  if (count === 0) return { started: false };

  // This server owns the book now; pictures marked as drawing belong to a dead run.
  await db.bookIllustration.updateMany({
    where: { bookId, status: "DRAWING" },
    data: { status: "PENDING", claimedAt: null },
  });

  const chain = options.chain ?? 0;
  const task = runBookIllustrations(bookId)
    .then(async ({ remaining }) => {
      if (!remaining || chain >= MAX_CHAIN) return;
      if (process.env.VERCEL) {
        // Carry on in a fresh function before this one hits its time limit.
        await postInternal("/api/internal/illustrations", { bookId, chain: chain + 1 });
      } else {
        // Long-lived server: pick up again once this job has let go.
        setTimeout(() => void scheduleBookIllustrations(bookId, { chain: chain + 1 }), 2_000);
      }
    })
    .catch((error) => {
      console.error(`[illustrations] job for ${bookId} crashed:`, error);
    })
    .finally(() => {
      activeJobs.delete(bookId);
    });
  activeJobs.set(bookId, task);
  return { started: true, task };
}

/** Fire-and-forget for in-process callers (local generation runner). */
export function kickBookIllustrations(bookId: string) {
  void scheduleBookIllustrations(bookId).catch((error) => {
    console.warn(
      `[illustrations] could not start for ${bookId}:`,
      error instanceof Error ? error.message : error
    );
  });
}

/** Retry pictures that failed: back to pending, and their chapters reopened for placing. */
export async function retryFailedIllustrations(bookId: string) {
  const failed = await db.bookIllustration.findMany({
    where: { bookId, status: "FAILED" },
    select: { id: true, chapterId: true },
  });
  if (!failed.length) return 0;
  await db.$transaction([
    db.bookIllustration.updateMany({
      where: { id: { in: failed.map((f) => f.id) } },
      data: { status: "PENDING", attempts: 0, error: null },
    }),
    db.chapter.updateMany({
      where: { id: { in: [...new Set(failed.map((f) => f.chapterId))] } },
      data: { illustratedAt: null },
    }),
  ]);
  return failed.length;
}

/**
 * A chapter was rewritten: its scene pictures pointed at old paragraphs, so
 * plan new ones. The opener still fits the chapter and stays.
 */
export async function resetChapterScenes(chapterId: string) {
  await db.$transaction([
    db.bookIllustration.deleteMany({ where: { chapterId, kind: "SCENE" } }),
    db.chapter.update({ where: { id: chapterId }, data: { illustratedAt: null } }),
  ]);
}
