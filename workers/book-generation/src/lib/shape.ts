const WORDS_PER_PAGE = 300;
const SECTIONS_PER_CHAPTER = 4;
const PAGES_PER_SECTION = 5;

export function resolveGenerationShape(book: {
  targetPages: number;
  sectionsPerChapter?: number | null;
  wordsPerPage?: number | null;
  chapterCount?: number | null;
}) {
  const wordsPerPage = book.wordsPerPage || WORDS_PER_PAGE;
  const preferredSpc = book.sectionsPerChapter || SECTIONS_PER_CHAPTER;

  if (book.targetPages <= 30) {
    const pagesPerSection = book.targetPages <= 12 ? 2 : 3;
    const totalSections = Math.max(
      1,
      Math.ceil(book.targetPages / pagesPerSection)
    );
    const chapterCount = Math.min(
      book.chapterCount ?? Math.max(1, Math.ceil(totalSections / 2)),
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

  const pagesPerSection = Math.max(
    1,
    Math.round(PAGES_PER_SECTION * (WORDS_PER_PAGE / wordsPerPage))
  );
  const pagesPerChapter = pagesPerSection * preferredSpc;
  const chapterCount =
    book.chapterCount ??
    Math.max(1, Math.ceil(book.targetPages / pagesPerChapter));

  return {
    chapterCount,
    sectionsPerChapter: preferredSpc,
    pagesPerSection,
    wordsPerPage,
  };
}
