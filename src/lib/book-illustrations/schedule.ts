import { db } from "@/lib/db";
import { getBaseUrl } from "@/lib/url";
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

function internalSecret(): string | null {
  return (
    process.env.GENERATION_WORKER_SECRET ||
    process.env.CRON_SECRET ||
    process.env.INTERNAL_PUSH_SECRET ||
    null
  );
}

/**
 * Continue in a fresh function before this one hits its time limit. Redirects
 * (apex to www) are followed by hand: fetch drops the Authorization header on
 * a cross-host redirect.
 */
async function continueInNewFunction(bookId: string, chain: number) {
  const secret = internalSecret();
  if (!secret) {
    console.warn("[illustrations] no internal secret set; remaining pictures wait for the next trigger");
    return;
  }
  let url = `${getBaseUrl()}/api/internal/illustrations`;
  const origin = new URL(url).hostname.replace(/^www\./, "");
  for (let hop = 0; hop < 3; hop += 1) {
    const res = await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ bookId, chain }),
      signal: AbortSignal.timeout(15_000),
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      const next = new URL(location, url);
      if (next.protocol !== "https:" && process.env.NODE_ENV === "production") return;
      if (!next.hostname.replace(/^www\./, "").endsWith(origin)) return;
      url = next.toString();
      continue;
    }
    if (!res.ok) {
      console.warn(`[illustrations] hand-off for ${bookId} failed: ${res.status}`);
    }
    return;
  }
}

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
        await continueInNewFunction(bookId, chain + 1);
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
