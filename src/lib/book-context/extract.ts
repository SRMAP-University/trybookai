import { OUTLINE_AI_MODEL } from "@/lib/ai-models";
import { createChatCompletion } from "@/lib/book-generator/llm";
import {
  buildChapterSummaryMessages,
  buildExtractMessages,
  cleanChapterSummary,
  composeStorySoFar,
  fallbackChapterSummary,
  mergeChapterState,
  mergeThreads,
  parseSectionUpdate,
  type SectionUpdate,
} from "@/lib/book-generator/core";
import { db } from "@/lib/db";

const LEDGER_MODEL = OUTLINE_AI_MODEL;

/** Ledger pass over a draft. Pure: nothing is stored until the final draft is chosen. */
export async function extractSectionUpdate(input: {
  sectionTitle: string;
  content: string;
  knownFacts?: string;
  openThreads?: string[];
}): Promise<SectionUpdate> {
  const raw = await createChatCompletion({
    model: LEDGER_MODEL,
    temperature: 0.2,
    max_tokens: 1400,
    messages: buildExtractMessages(input),
  });
  return parseSectionUpdate(raw);
}

/** Store a section's ledger entry and fold it into chapter, canon and story state. */
export async function applySectionUpdate(
  ids: { bookId: string; chapterId: string; sectionId: string },
  update: SectionUpdate
): Promise<void> {
  await db.sectionState.upsert({
    where: { sectionId: ids.sectionId },
    create: {
      sectionId: ids.sectionId,
      summary: update.sectionSummary,
      objective: update.objective,
      charactersPresent: update.charactersPresent,
    },
    update: {
      summary: update.sectionSummary,
      objective: update.objective ?? null,
      charactersPresent: update.charactersPresent,
    },
  });

  const prev = await db.chapterState.findUnique({
    where: { chapterId: ids.chapterId },
  });
  const merged = mergeChapterState(prev, update);
  await db.chapterState.upsert({
    where: { chapterId: ids.chapterId },
    create: { chapterId: ids.chapterId, ...merged },
    update: merged,
  });

  for (const fact of update.newFacts) {
    const existing = await db.canonFact.findFirst({
      where: {
        bookId: ids.bookId,
        subject: { equals: fact.subject, mode: "insensitive" },
        predicate: { equals: fact.predicate, mode: "insensitive" },
        object: { equals: fact.object, mode: "insensitive" },
      },
    });
    if (existing) {
      await db.canonFact.update({
        where: { id: existing.id },
        data: {
          status: "CANON",
          sourceChapterId: ids.chapterId,
          sourceSectionId: ids.sectionId,
          confidence: 0.8,
        },
      });
    } else {
      await db.canonFact.create({
        data: {
          bookId: ids.bookId,
          ...fact,
          status: "CANON",
          sourceChapterId: ids.chapterId,
          sourceSectionId: ids.sectionId,
          confidence: 0.75,
        },
      });
    }
  }

  if (update.openThreads.length || update.resolvedThreads.length) {
    const story = await db.storyState.findUnique({ where: { bookId: ids.bookId } });
    const threads = mergeThreads(story?.openThreads, update, 20);
    await db.storyState.upsert({
      where: { bookId: ids.bookId },
      create: { bookId: ids.bookId, openThreads: threads },
      update: { openThreads: threads },
    });
  }
}

/** After a chapter completes, compress it into Chapter.summary and refresh the book summary. */
export async function refreshChapterCanon(
  bookId: string,
  chapterId: string
): Promise<void> {
  const chapter = await db.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    select: {
      number: true,
      title: true,
      sections: {
        orderBy: { number: "asc" },
        select: { state: { select: { summary: true } } },
      },
    },
  });
  const sectionSummaries = chapter.sections
    .map((s) => s.state?.summary ?? "")
    .filter(Boolean);

  let summary = "";
  if (sectionSummaries.length) {
    try {
      summary = cleanChapterSummary(
        await createChatCompletion({
          model: LEDGER_MODEL,
          temperature: 0.2,
          max_tokens: 500,
          messages: buildChapterSummaryMessages(chapter, sectionSummaries),
        })
      );
    } catch (error) {
      console.warn(
        "[canon] chapter summary failed:",
        error instanceof Error ? error.message : error
      );
    }
    summary ||= fallbackChapterSummary(sectionSummaries);
  }

  if (summary) {
    await db.chapter.update({ where: { id: chapterId }, data: { summary } });
    await db.chapterState.upsert({
      where: { chapterId },
      create: { chapterId, summary },
      update: { summary },
    });
  }

  const completed = await db.chapter.findMany({
    where: { bookId, status: "COMPLETED" },
    orderBy: { number: "asc" },
    select: { number: true, title: true, summary: true },
  });
  const bookSummary = composeStorySoFar(completed, 3000);

  await db.storyState.upsert({
    where: { bookId },
    create: { bookId, bookSummary, plotPhase: "in_progress" },
    update: { bookSummary, plotPhase: "in_progress" },
  });
}
