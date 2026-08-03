import {
  PAGES_PER_SECTION,
  SECTIONS_PER_CHAPTER,
  WORDS_PER_PAGE,
} from "@/lib/constants";

function estimateChapters(
  targetPages: number,
  sectionsPerChapter: number,
  wordsPerPage: number
): number {
  const pagesPerSection = Math.max(
    1,
    Math.round(PAGES_PER_SECTION * (WORDS_PER_PAGE / wordsPerPage))
  );
  const pagesPerChapter = pagesPerSection * sectionsPerChapter;
  return Math.max(1, Math.ceil(targetPages / pagesPerChapter));
}

/**
 * Chapters / sections / pages-per-section sized to the book target.
 * Short/medium books use smaller sections so each LLM call finishes faster
 * (DeepSeek R1 on 5-page chunks was causing 20+ min for ~20 page books).
 */
export function resolveGenerationShape(book: {
  targetPages: number;
  sectionsPerChapter?: number | null;
  wordsPerPage?: number | null;
  chapterCount?: number | null;
}) {
  const wordsPerPage = book.wordsPerPage || WORDS_PER_PAGE;
  const preferredSpc = book.sectionsPerChapter || SECTIONS_PER_CHAPTER;

  // ≤30 pages: compact shape — ~2–3 pages per section, fewer huge R1 calls.
  if (book.targetPages <= 30) {
    const pagesPerSection = book.targetPages <= 12 ? 2 : 3;
    const totalSections = Math.max(
      1,
      Math.ceil(book.targetPages / pagesPerSection)
    );
    const chapterCount = Math.min(
      book.chapterCount ??
        Math.max(1, Math.ceil(totalSections / 2)),
      book.targetPages
    );
    const sectionsPerChapter = Math.max(
      1,
      Math.ceil(totalSections / chapterCount)
    );
    return {
      chapterCount,
      sectionsPerChapter,
      pagesPerSection,
      wordsPerPage,
    };
  }

  const chapterCount =
    book.chapterCount ??
    estimateChapters(book.targetPages, preferredSpc, wordsPerPage);
  const pagesPerSection = Math.max(
    1,
    Math.round(PAGES_PER_SECTION * (WORDS_PER_PAGE / wordsPerPage))
  );

  return {
    chapterCount,
    sectionsPerChapter: preferredSpc,
    pagesPerSection,
    wordsPerPage,
  };
}
