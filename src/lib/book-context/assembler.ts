import { db } from "@/lib/db";
import {
  asStringArray,
  composeSectionPrompt,
  type ComposedSectionPrompt,
} from "@/lib/book-generator/core";

export type AssembledSection = ComposedSectionPrompt & {
  chapterId: string;
  chapterTitle: string;
  sectionTitle: string;
  /** Book-level open threads, passed to the continuity ledger. */
  openThreads: string[];
};

/**
 * Load everything the writer needs for one section and compose its prompt:
 * plans from the outline, the chapter roadmap, recency-weighted prior
 * chapters, continuity notes, and the end of the previous section.
 */
export async function assembleSectionContext(
  bookId: string,
  sectionId: string
): Promise<AssembledSection> {
  const section = await db.section.findFirstOrThrow({
    where: { id: sectionId, chapter: { bookId } },
    select: {
      number: true,
      title: true,
      chapter: {
        select: {
          id: true,
          number: true,
          title: true,
          summary: true,
          state: { select: { location: true, charactersPresent: true } },
          sections: {
            orderBy: { number: "asc" },
            select: {
              number: true,
              title: true,
              wordCount: true,
              state: { select: { summary: true } },
            },
          },
        },
      },
    },
  });
  const { chapter } = section;

  const book = await db.book.findUniqueOrThrow({
    where: { id: bookId },
    include: {
      bible: {
        include: {
          characters: { orderBy: { createdAt: "asc" }, take: 60 },
          locations: { orderBy: { createdAt: "asc" }, take: 40 },
          factions: { take: 12 },
        },
      },
      storyState: { select: { openThreads: true } },
    },
  });

  const [chapters, total, before, prevInChapter, facts] = await Promise.all([
    db.chapter.findMany({
      where: { bookId },
      orderBy: { number: "asc" },
      select: { number: true, title: true, summary: true },
    }),
    db.section.count({ where: { chapter: { bookId } } }),
    db.section.count({
      where: {
        chapter: { bookId },
        OR: [
          { chapter: { number: { lt: chapter.number } } },
          { chapterId: chapter.id, number: { lt: section.number } },
        ],
      },
    }),
    db.section.findFirst({
      where: {
        chapterId: chapter.id,
        number: { lt: section.number },
        wordCount: { gt: 0 },
      },
      orderBy: { number: "desc" },
      select: { content: true },
    }),
    db.canonFact.findMany({
      where: { bookId, status: "CANON" },
      orderBy: { updatedAt: "desc" },
      take: 80,
      select: { subject: true, predicate: true, object: true },
    }),
  ]);

  // Only the previous chapter's final section hands off; if it isn't written
  // yet, the prompt uses that chapter's planned ending.
  const prevChapterEnd = prevInChapter?.content
    ? null
    : await db.section.findFirst({
        where: { chapter: { bookId, number: chapter.number - 1 } },
        orderBy: { number: "desc" },
        select: { content: true, wordCount: true },
      });
  const previousContent =
    prevInChapter?.content ??
    (prevChapterEnd && prevChapterEnd.wordCount > 0 ? prevChapterEnd.content : null);
  const openThreads = asStringArray(book.storyState?.openThreads);

  const composed = composeSectionPrompt({
    book,
    outline: book.outline,
    bible: book.bible
      ? {
          styleNotes: book.bible.styleNotes,
          worldRules: book.bible.worldRules,
          themes: book.bible.themes,
        }
      : null,
    characters: book.bible?.characters ?? [],
    locations: book.bible?.locations ?? [],
    factions: (book.bible?.factions ?? []).map((f) => f.name),
    facts,
    openThreads,
    totalChapters: chapters.length,
    chapter: {
      number: chapter.number,
      title: chapter.title,
      summary: chapter.summary,
      location: chapter.state?.location ?? null,
      charactersPresent: chapter.state?.charactersPresent,
    },
    nextChapter: chapters.find((c) => c.number > chapter.number) ?? null,
    priorChapters: chapters.filter((c) => c.number < chapter.number),
    chapterSections: chapter.sections.map((s) => ({
      number: s.number,
      title: s.title,
      done: s.wordCount > 0,
      summary: s.state?.summary ?? null,
    })),
    section: { number: section.number, title: section.title },
    previousText: previousContent
      ? { content: previousContent, fromPreviousChapter: !prevInChapter?.content }
      : null,
    bookPosition: { index: before, total },
  });

  return {
    ...composed,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    sectionTitle: section.title,
    openThreads,
  };
}
