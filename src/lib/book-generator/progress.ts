import { db } from "@/lib/db";

export type BookProgressOptions = {
  activeSectionId?: string;
  draftWordCount?: number;
  targetSectionWords?: number;
  wordsPerPage?: number;
};

export async function computeBookProgress(
  bookId: string,
  options: BookProgressOptions = {}
) {
  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { status: true, targetPages: true, wordsPerPage: true },
  });

  if (!book) {
    return {
      progress: 0,
      currentPages: 0,
      targetPages: 0,
      allDone: false,
    };
  }

  if (book.status === "OUTLINING") {
    return {
      progress: 3,
      currentPages: 0,
      targetPages: book.targetPages,
      allDone: false,
    };
  }

  const wordsPerPage = options.wordsPerPage ?? book.wordsPerPage ?? 300;

  const sections = await db.section.findMany({
    where: { chapter: { bookId } },
    select: { id: true, wordCount: true, pageCount: true },
  });

  if (sections.length === 0) {
    return {
      progress: 5,
      currentPages: 0,
      targetPages: book.targetPages,
      allDone: false,
    };
  }

  const completedSections = sections.filter((s) => s.wordCount > 0).length;

  let inSectionFraction = 0;
  if (
    options.activeSectionId &&
    options.draftWordCount &&
    options.targetSectionWords &&
    options.targetSectionWords > 0
  ) {
    const activeDone = sections.some(
      (s) => s.id === options.activeSectionId && s.wordCount > 0
    );
    if (!activeDone) {
      inSectionFraction = Math.min(
        0.95,
        options.draftWordCount / options.targetSectionWords
      );
    }
  }

  const sectionProgress =
    (completedSections + inSectionFraction) / sections.length;
  const progress = Math.min(
    99,
    Math.round((5 + sectionProgress * 90) * 10) / 10
  );

  let currentPages = sections
    .filter((s) => s.wordCount > 0)
    .reduce((sum, s) => sum + s.pageCount, 0);

  if (
    options.activeSectionId &&
    options.draftWordCount &&
    options.draftWordCount > 0
  ) {
    const activeSection = sections.find((s) => s.id === options.activeSectionId);
    if (activeSection && activeSection.wordCount === 0) {
      currentPages += Math.max(
        1,
        Math.ceil(options.draftWordCount / wordsPerPage)
      );
    }
  }

  const allDone = completedSections === sections.length;

  return {
    progress: allDone ? 100 : progress,
    currentPages,
    targetPages: book.targetPages,
    allDone,
  };
}

export async function applyBookProgress(
  bookId: string,
  options: BookProgressOptions = {}
) {
  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { status: true },
  });
  if (!book) return null;

  const result = await computeBookProgress(bookId, options);

  await db.book.update({
    where: { id: bookId },
    data: {
      currentPages: result.currentPages,
      progress: result.progress,
      status: result.allDone
        ? "COMPLETED"
        : book.status === "OUTLINING"
          ? "OUTLINING"
          : "GENERATING",
      completedAt: result.allDone ? new Date() : null,
    },
  });

  return result;
}

export async function creditSectionPages(userId: string, pageCount: number) {
  if (pageCount <= 0) return;
  await db.user.update({
    where: { id: userId },
    data: { pagesUsed: { increment: pageCount } },
  });
}
