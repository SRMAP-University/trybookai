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

/** Chapters / sections / pages-per-section sized to the book target. */
export function resolveGenerationShape(book: {
  targetPages: number;
  sectionsPerChapter?: number | null;
  wordsPerPage?: number | null;
  chapterCount?: number | null;
}) {
  const wordsPerPage = book.wordsPerPage || WORDS_PER_PAGE;
  const preferredSpc = book.sectionsPerChapter || SECTIONS_PER_CHAPTER;

  // Short books: keep outline proportional so we don't write 4×5-page sections
  // for a 3-page target.
  if (book.targetPages <= 12) {
    const chapterCount = Math.min(
      book.chapterCount ?? Math.max(1, Math.ceil(book.targetPages / 4)),
      book.targetPages
    );
    const sectionsPerChapter = Math.max(
      1,
      Math.ceil(book.targetPages / chapterCount)
    );
    const totalSections = chapterCount * sectionsPerChapter;
    const pagesPerSection = Math.max(
      1,
      Math.round(book.targetPages / totalSections)
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
