import { db, withDbRetry } from "@/lib/db";
import {
  applySectionUpdate,
  assembleSectionContext,
  extractSectionUpdate,
  refreshChapterCanon,
} from "@/lib/book-context";
import {
  applyBookProgress,
  creditSectionPages,
} from "@/lib/book-generator/progress";
import {
  countWords,
  creditedSectionPages,
  draftSection,
  reviseForContinuity,
  WORDS_PER_PAGE,
  type LlmCall,
  type SectionUpdate,
} from "@/lib/book-generator/core";

/**
 * Write one section end to end: compose the prompt, draft with length
 * control, run the continuity ledger (revising once on a conflict), save,
 * and close out the chapter when it is the last section.
 *
 * `call` performs the prose calls, so callers decide whether tokens stream.
 */
export async function writeSection(
  sectionId: string,
  options: {
    call: LlmCall;
    /** Called before a continuity revision replaces the streamed draft. */
    onRevisionStart?: () => void;
  }
) {
  const section = await db.section.findUniqueOrThrow({
    where: { id: sectionId },
    select: {
      title: true,
      chapter: {
        select: {
          id: true,
          book: {
            select: {
              id: true,
              userId: true,
              language: true,
              creativity: true,
              wordsPerPage: true,
            },
          },
        },
      },
    },
  });
  const { chapter } = section;
  const { book } = chapter;
  const wordsPerPage = book.wordsPerPage || WORDS_PER_PAGE;
  const temperature = book.creativity ?? 0.7;

  const prompt = await assembleSectionContext(book.id, sectionId);
  const titles = {
    sectionTitle: prompt.sectionTitle,
    chapterTitle: prompt.chapterTitle,
  };

  const draft = await draftSection({
    messages: prompt.messages,
    targetWords: prompt.targetWords,
    language: book.language,
    temperature,
    titles,
    call: options.call,
  });

  const extract = (content: string) =>
    extractSectionUpdate({
      sectionTitle: section.title,
      content,
      knownFacts: prompt.factsBrief,
      openThreads: prompt.openThreads,
    }).catch((error) => {
      console.warn(
        "[section] extract canon failed:",
        error instanceof Error ? error.message : error
      );
      return null;
    });

  let content = draft.content;
  let update: SectionUpdate | null = await extract(content);

  // One continuity revision when the ledger reports a conflict with canon.
  if (update?.contradictions.length) {
    options.onRevisionStart?.();
    const revised = await reviseForContinuity({
      messages: prompt.messages,
      draft: content,
      contradictions: update.contradictions,
      language: book.language,
      temperature,
      titles,
      call: options.call,
    }).catch((error) => {
      console.warn(
        "[section] consistency revise failed:",
        error instanceof Error ? error.message : error
      );
      return null;
    });
    if (revised) {
      content = revised;
      update = (await extract(revised)) ?? update;
    }
  }

  const wordCount = countWords(content);
  const pageCount = creditedSectionPages(wordCount, wordsPerPage, prompt.pageBudget);

  await withDbRetry("section.update", () =>
    db.section.update({
      where: { id: sectionId },
      data: { content, wordCount, pageCount },
    })
  );

  if (update) {
    await applySectionUpdate(
      { bookId: book.id, chapterId: chapter.id, sectionId },
      update
    ).catch((error) => {
      console.warn(
        "[section] save canon failed:",
        error instanceof Error ? error.message : error
      );
    });
  }

  const siblings = await db.section.findMany({
    where: { chapterId: chapter.id },
    orderBy: { number: "asc" },
    select: { content: true, wordCount: true, pageCount: true },
  });
  if (siblings.every((s) => s.wordCount > 0)) {
    await db.chapter.update({
      where: { id: chapter.id },
      data: {
        content: siblings.map((s) => s.content).join("\n\n"),
        pageCount: siblings.reduce((sum, s) => sum + s.pageCount, 0),
        status: "COMPLETED",
      },
    });
    await refreshChapterCanon(book.id, chapter.id).catch((error) => {
      console.warn(
        "[section] refresh chapter canon failed:",
        error instanceof Error ? error.message : error
      );
    });
  }

  await creditSectionPages(book.userId, pageCount);
  const progress = await applyBookProgress(book.id, { wordsPerPage });

  return {
    chapterId: chapter.id,
    content,
    wordCount,
    pageCount,
    targetWords: prompt.targetWords,
    progress,
  };
}
