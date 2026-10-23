import { db } from "@/lib/db";
import { ILLUSTRATION_STALE_MS } from "@/lib/book-illustrations/runner";

export type IllustrationStatus = {
  enabled: boolean;
  /** A job holds a fresh heartbeat */
  running: boolean;
  /** Finished chapters, and how many of them have their pictures in place */
  chaptersTotal: number;
  chaptersDone: number;
  ready: number;
  failed: number;
  waiting: number;
  /** Something a job could do right now */
  actionable: boolean;
  openers: { number: number; title: string; imageUrl: string }[];
};

export async function getIllustrationStatus(bookId: string): Promise<IllustrationStatus | null> {
  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { includeIllustrations: true, illustrationHeartbeatAt: true },
  });
  if (!book) return null;

  const [chaptersTotal, chaptersDone, counts, openers] = await Promise.all([
    db.chapter.count({ where: { bookId, status: "COMPLETED" } }),
    db.chapter.count({ where: { bookId, status: "COMPLETED", illustratedAt: { not: null } } }),
    db.bookIllustration.groupBy({ by: ["status"], where: { bookId }, _count: { _all: true } }),
    db.chapter.findMany({
      where: { bookId, imageUrl: { not: null } },
      orderBy: { number: "asc" },
      select: { number: true, title: true, imageUrl: true },
      take: 12,
    }),
  ]);
  const count = (status: string) => counts.find((c) => c.status === status)?._count._all ?? 0;
  const waiting = count("PENDING") + count("DRAWING");
  const running = Boolean(
    book.illustrationHeartbeatAt &&
      Date.now() - book.illustrationHeartbeatAt.getTime() < ILLUSTRATION_STALE_MS
  );

  return {
    enabled: book.includeIllustrations,
    running,
    chaptersTotal,
    chaptersDone,
    ready: count("READY"),
    failed: count("FAILED"),
    waiting,
    actionable: book.includeIllustrations && (chaptersDone < chaptersTotal || waiting > 0),
    openers: openers.map((c) => ({ number: c.number, title: c.title, imageUrl: c.imageUrl! })),
  };
}
