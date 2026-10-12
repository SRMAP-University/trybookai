/** Book shape and per-section length/page budgets (shared by app + worker). */

import { usesCharacterCount, languageName } from "./text";

export const WORDS_PER_PAGE = 300;
export const SECTIONS_PER_CHAPTER = 4;
export const PAGES_PER_SECTION = 5;

/** Below this a section can't carry a scene or a sub-topic. */
const MIN_SECTION_WORDS = 200;

/**
 * Chapters / sections / pages-per-section sized to the book target.
 * Short/medium books use smaller sections so each LLM call finishes faster.
 */
export function resolveGenerationShape(book: {
  targetPages: number;
  sectionsPerChapter?: number | null;
  wordsPerPage?: number | null;
  chapterCount?: number | null;
}) {
  const wordsPerPage = book.wordsPerPage || WORDS_PER_PAGE;
  const preferredSpc = book.sectionsPerChapter || SECTIONS_PER_CHAPTER;

  // ≤30 pages: compact shape — ~2–3 pages per section.
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
    return { chapterCount, sectionsPerChapter, pagesPerSection, wordsPerPage };
  }

  const pagesPerSection = Math.max(
    1,
    Math.round(PAGES_PER_SECTION * (WORDS_PER_PAGE / wordsPerPage))
  );
  const chapterCount =
    book.chapterCount ??
    Math.max(1, Math.ceil(book.targetPages / (pagesPerSection * preferredSpc)));

  return {
    chapterCount,
    sectionsPerChapter: preferredSpc,
    pagesPerSection,
    wordsPerPage,
  };
}

/**
 * Words each section should carry so the finished book lands on targetPages,
 * based on how many sections the outline actually produced.
 */
export function sectionWordTarget(
  book: { targetPages: number; wordsPerPage?: number | null },
  totalSections: number
): number {
  const wordsPerPage = book.wordsPerPage || WORDS_PER_PAGE;
  const perSection = (book.targetPages * wordsPerPage) / Math.max(1, totalSections);
  return Math.max(MIN_SECTION_WORDS, Math.round(perSection / 10) * 10);
}

/**
 * Page budget for the section at `index` (0-based, book order). Budgets are
 * spread with cumulative rounding so they always sum to exactly targetPages.
 */
export function sectionPageBudget(
  targetPages: number,
  totalSections: number,
  index: number
): number {
  const n = Math.max(1, totalSections);
  const i = Math.min(Math.max(0, index), n - 1);
  return Math.round(((i + 1) * targetPages) / n) - Math.round((i * targetPages) / n);
}

/** Pages credited for a written section: its budget, or fewer if it came in short. */
export function creditedSectionPages(
  wordCount: number,
  wordsPerPage: number,
  pageBudget: number
): number {
  if (wordCount <= 0 || pageBudget <= 0) return 0;
  return Math.min(pageBudget, Math.max(1, Math.ceil(wordCount / wordsPerPage)));
}

/** Rough output tokens needed per word, by script. */
export function tokensPerWord(language: string | null | undefined): number {
  if (usesCharacterCount(language)) return 2.4;
  const name = languageName(language);
  if (["Hindi", "Arabic", "Bengali", "Urdu", "Korean", "Russian"].includes(name)) {
    return 3.2;
  }
  return name === "English" ? 1.4 : 1.8;
}

/** max_tokens for a prose call: target plus headroom, within provider limits. */
export function proseMaxTokens(
  words: number,
  language: string | null | undefined,
  ceiling = 8192
): number {
  return Math.min(
    ceiling,
    Math.max(1024, Math.ceil(words * tokensPerWord(language) * 1.5))
  );
}
