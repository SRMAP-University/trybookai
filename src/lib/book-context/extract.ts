import { createChatCompletion, extractJsonPayload, extractModelText } from "@/lib/book-generator/llm";
import {
  asStringArray,
  type ExtractedSectionUpdate,
} from "@/lib/book-context/types";
import { db } from "@/lib/db";

function parseExtract(raw: string): ExtractedSectionUpdate {
  try {
    const parsed = JSON.parse(extractJsonPayload(raw)) as Partial<ExtractedSectionUpdate>;
    return {
      sectionSummary: String(parsed.sectionSummary ?? "").slice(0, 1200),
      objective: parsed.objective ? String(parsed.objective).slice(0, 400) : undefined,
      charactersPresent: asStringArray(parsed.charactersPresent).slice(0, 12),
      location: parsed.location ? String(parsed.location).slice(0, 120) : undefined,
      events: asStringArray(parsed.events).slice(0, 12),
      newFacts: Array.isArray(parsed.newFacts)
        ? parsed.newFacts
            .map((f) => ({
              subject: String((f as { subject?: string }).subject ?? "").slice(0, 120),
              predicate: String((f as { predicate?: string }).predicate ?? "").slice(0, 80),
              object: String((f as { object?: string }).object ?? "").slice(0, 240),
            }))
            .filter((f) => f.subject && f.predicate && f.object)
            .slice(0, 12)
        : [],
      openThreads: asStringArray(parsed.openThreads).slice(0, 10),
      contradictions: asStringArray(parsed.contradictions).slice(0, 8),
    };
  } catch {
    return {
      sectionSummary: raw.slice(0, 400),
      charactersPresent: [],
      events: [],
      newFacts: [],
      openThreads: [],
      contradictions: [],
    };
  }
}

/**
 * Cheap-model pass: summarize section, update chapter/story state, upsert canon facts.
 * Returns contradictions for an optional revise loop.
 */
export async function extractAndUpdateCanon(input: {
  bookId: string;
  chapterId: string;
  sectionId: string;
  sectionTitle: string;
  content: string;
  existingFactsBrief?: string;
}): Promise<ExtractedSectionUpdate> {
  const prose = input.content.slice(0, 6000);
  const raw = await createChatCompletion({
    model: "llama-3.3",
    temperature: 0.2,
    max_tokens: 1200,
    messages: [
      {
        role: "system",
        content: `You maintain a book canon ledger. Return ONLY JSON:
{
  "sectionSummary": "100-200 token scene summary",
  "objective": "what this scene accomplished",
  "charactersPresent": ["Name"],
  "location": "place or null",
  "events": ["short event"],
  "newFacts": [{"subject":"","predicate":"","object":""}],
  "openThreads": ["unresolved question"],
  "contradictions": ["conflict with known facts if any"]
}
Facts must be concrete canon statements. Contradictions list conflicts with KNOWN FACTS only.`,
      },
      {
        role: "user",
        content: `Section: ${input.sectionTitle}

KNOWN FACTS:
${input.existingFactsBrief || "(none yet)"}

PROSE:
${prose}`,
      },
    ],
  });

  const update = parseExtract(extractModelText(raw));

  await db.sectionState.upsert({
    where: { sectionId: input.sectionId },
    create: {
      sectionId: input.sectionId,
      summary: update.sectionSummary,
      objective: update.objective,
      charactersPresent: update.charactersPresent,
    },
    update: {
      summary: update.sectionSummary,
      objective: update.objective,
      charactersPresent: update.charactersPresent,
    },
  });

  const chapterState = await db.chapterState.findUnique({
    where: { chapterId: input.chapterId },
  });

  const mergedEvents = [
    ...asStringArray(chapterState?.events),
    ...update.events,
  ].slice(-20);
  const mergedChars = [
    ...new Set([
      ...asStringArray(chapterState?.charactersPresent),
      ...update.charactersPresent,
    ]),
  ].slice(0, 20);
  const mergedThreads = [
    ...new Set([
      ...asStringArray(chapterState?.openThreads),
      ...update.openThreads,
    ]),
  ].slice(0, 16);
  const mergedFacts = [
    ...asStringArray(chapterState?.newFacts),
    ...update.newFacts.map((f) => `${f.subject} ${f.predicate} ${f.object}`),
  ].slice(-24);

  await db.chapterState.upsert({
    where: { chapterId: input.chapterId },
    create: {
      chapterId: input.chapterId,
      summary: update.sectionSummary,
      charactersPresent: mergedChars,
      location: update.location,
      events: mergedEvents,
      newFacts: mergedFacts,
      openThreads: mergedThreads,
    },
    update: {
      summary: [
        chapterState?.summary,
        update.sectionSummary,
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 2000),
      charactersPresent: mergedChars,
      location: update.location ?? chapterState?.location,
      events: mergedEvents,
      newFacts: mergedFacts,
      openThreads: mergedThreads,
    },
  });

  for (const fact of update.newFacts) {
    const existing = await db.canonFact.findFirst({
      where: {
        bookId: input.bookId,
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
          sourceChapterId: input.chapterId,
          sourceSectionId: input.sectionId,
          confidence: 0.8,
        },
      });
    } else {
      await db.canonFact.create({
        data: {
          bookId: input.bookId,
          subject: fact.subject,
          predicate: fact.predicate,
          object: fact.object,
          status: "CANON",
          sourceChapterId: input.chapterId,
          sourceSectionId: input.sectionId,
          confidence: 0.75,
        },
      });
    }
  }

  if (update.openThreads.length) {
    const story = await db.storyState.findUnique({ where: { bookId: input.bookId } });
    const threads = [
      ...new Set([
        ...asStringArray(story?.openThreads),
        ...update.openThreads,
      ]),
    ].slice(0, 24);
    await db.storyState.upsert({
      where: { bookId: input.bookId },
      create: {
        bookId: input.bookId,
        openThreads: threads,
      },
      update: { openThreads: threads },
    });
  }

  return update;
}

/** After a chapter completes, compress chapter state into Chapter.summary + story state. */
export async function refreshChapterCanon(
  bookId: string,
  chapterId: string
): Promise<void> {
  const chapter = await db.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    include: { state: true, sections: { include: { state: true }, orderBy: { number: "asc" } } },
  });

  const summary =
    chapter.state?.summary ||
    chapter.sections
      .map((s) => s.state?.summary)
      .filter(Boolean)
      .join(" ")
      .slice(0, 1500) ||
    chapter.summary;

  if (summary) {
    await db.chapter.update({
      where: { id: chapterId },
      data: { summary },
    });
    await db.chapterState.upsert({
      where: { chapterId },
      create: { chapterId, summary },
      update: { summary },
    });
  }

  const completed = await db.chapter.findMany({
    where: { bookId, status: "COMPLETED" },
    orderBy: { number: "asc" },
    select: { number: true, title: true, summary: true, state: true },
  });
  const bookSummary = completed
    .map((c) => `Ch ${c.number} ${c.title}: ${c.state?.summary ?? c.summary ?? ""}`)
    .join("\n")
    .slice(0, 3000);

  await db.storyState.upsert({
    where: { bookId },
    create: { bookId, bookSummary, plotPhase: "in_progress" },
    update: { bookSummary, plotPhase: "in_progress" },
  });
}
