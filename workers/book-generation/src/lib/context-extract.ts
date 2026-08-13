import type { Sql } from "./db";
import { extractJsonPayload, OUTLINE_CF_MODEL, runAi } from "./ai";
import { asStringArray, newRowId } from "./context-utils";

export type ExtractedSectionUpdate = {
  sectionSummary: string;
  objective?: string;
  charactersPresent: string[];
  location?: string;
  events: string[];
  newFacts: Array<{ subject: string; predicate: string; object: string }>;
  openThreads: string[];
  contradictions: string[];
};

function parseExtract(raw: string): ExtractedSectionUpdate {
  try {
    const parsed = JSON.parse(extractJsonPayload(raw)) as Partial<ExtractedSectionUpdate>;
    return {
      sectionSummary: String(parsed.sectionSummary ?? "").slice(0, 1200),
      objective: parsed.objective
        ? String(parsed.objective).slice(0, 400)
        : undefined,
      charactersPresent: asStringArray(parsed.charactersPresent).slice(0, 12),
      location: parsed.location
        ? String(parsed.location).slice(0, 120)
        : undefined,
      events: asStringArray(parsed.events).slice(0, 12),
      newFacts: Array.isArray(parsed.newFacts)
        ? parsed.newFacts
            .map((f) => ({
              subject: String(
                (f as { subject?: string }).subject ?? ""
              ).slice(0, 120),
              predicate: String(
                (f as { predicate?: string }).predicate ?? ""
              ).slice(0, 80),
              object: String((f as { object?: string }).object ?? "").slice(
                0,
                240
              ),
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

export async function extractAndUpdateCanon(
  sql: Sql,
  ai: Ai,
  input: {
    bookId: string;
    chapterId: string;
    sectionId: string;
    sectionTitle: string;
    content: string;
    existingFactsBrief?: string;
  }
): Promise<ExtractedSectionUpdate> {
  const prose = input.content.slice(0, 6000);
  const raw = await runAi(
    ai,
    OUTLINE_CF_MODEL,
    [
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
}`,
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
    { max_tokens: 1200, temperature: 0.2 }
  );

  const update = parseExtract(raw);

  const secState = await sql<{ id: string }[]>`
    SELECT id FROM "SectionState" WHERE "sectionId" = ${input.sectionId} LIMIT 1
  `;
  if (!secState[0]) {
    await sql`
      INSERT INTO "SectionState" (
        id, "sectionId", summary, objective, "charactersPresent", "createdAt", "updatedAt"
      ) VALUES (
        ${newRowId()}, ${input.sectionId}, ${update.sectionSummary},
        ${update.objective ?? null},
        ${sql.json(update.charactersPresent as never)},
        NOW(), NOW()
      )
    `;
  } else {
    await sql`
      UPDATE "SectionState"
      SET
        summary = ${update.sectionSummary},
        objective = ${update.objective ?? null},
        "charactersPresent" = ${sql.json(update.charactersPresent as never)},
        "updatedAt" = NOW()
      WHERE "sectionId" = ${input.sectionId}
    `;
  }

  const chStateRows = await sql<
    {
      id: string;
      summary: string | null;
      charactersPresent: unknown;
      events: unknown;
      newFacts: unknown;
      openThreads: unknown;
      location: string | null;
    }[]
  >`
    SELECT id, summary, "charactersPresent", events, "newFacts", "openThreads", location
    FROM "ChapterState" WHERE "chapterId" = ${input.chapterId} LIMIT 1
  `;
  const chState = chStateRows[0];
  const mergedEvents = [
    ...asStringArray(chState?.events),
    ...update.events,
  ].slice(-20);
  const mergedChars = [
    ...new Set([
      ...asStringArray(chState?.charactersPresent),
      ...update.charactersPresent,
    ]),
  ].slice(0, 20);
  const mergedThreads = [
    ...new Set([
      ...asStringArray(chState?.openThreads),
      ...update.openThreads,
    ]),
  ].slice(0, 16);
  const mergedFacts = [
    ...asStringArray(chState?.newFacts),
    ...update.newFacts.map((f) => `${f.subject} ${f.predicate} ${f.object}`),
  ].slice(-24);
  const combinedSummary = [chState?.summary, update.sectionSummary]
    .filter(Boolean)
    .join(" ")
    .slice(0, 2000);

  if (!chState) {
    await sql`
      INSERT INTO "ChapterState" (
        id, "chapterId", summary, "charactersPresent", location, events, "newFacts", "openThreads", "createdAt", "updatedAt"
      ) VALUES (
        ${newRowId()}, ${input.chapterId}, ${combinedSummary},
        ${sql.json(mergedChars as never)},
        ${update.location ?? null},
        ${sql.json(mergedEvents as never)},
        ${sql.json(mergedFacts as never)},
        ${sql.json(mergedThreads as never)},
        NOW(), NOW()
      )
    `;
  } else {
    await sql`
      UPDATE "ChapterState"
      SET
        summary = ${combinedSummary},
        "charactersPresent" = ${sql.json(mergedChars as never)},
        location = COALESCE(${update.location ?? null}, location),
        events = ${sql.json(mergedEvents as never)},
        "newFacts" = ${sql.json(mergedFacts as never)},
        "openThreads" = ${sql.json(mergedThreads as never)},
        "updatedAt" = NOW()
      WHERE "chapterId" = ${input.chapterId}
    `;
  }

  for (const fact of update.newFacts) {
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM "CanonFact"
      WHERE "bookId" = ${input.bookId}
        AND LOWER(subject) = LOWER(${fact.subject})
        AND LOWER(predicate) = LOWER(${fact.predicate})
        AND LOWER(object) = LOWER(${fact.object})
      LIMIT 1
    `;
    if (existing[0]) {
      await sql`
        UPDATE "CanonFact"
        SET status = 'CANON',
            "sourceChapterId" = ${input.chapterId},
            "sourceSectionId" = ${input.sectionId},
            confidence = 0.8,
            "updatedAt" = NOW()
        WHERE id = ${existing[0].id}
      `;
    } else {
      await sql`
        INSERT INTO "CanonFact" (
          id, "bookId", subject, predicate, object, status,
          "sourceChapterId", "sourceSectionId", confidence, "createdAt", "updatedAt"
        ) VALUES (
          ${newRowId()}, ${input.bookId}, ${fact.subject}, ${fact.predicate}, ${fact.object},
          'CANON', ${input.chapterId}, ${input.sectionId}, 0.75, NOW(), NOW()
        )
      `;
    }
  }

  if (update.openThreads.length) {
    const story = await sql<{ openThreads: unknown }[]>`
      SELECT "openThreads" FROM "StoryState" WHERE "bookId" = ${input.bookId} LIMIT 1
    `;
    const threads = [
      ...new Set([
        ...asStringArray(story[0]?.openThreads),
        ...update.openThreads,
      ]),
    ].slice(0, 24);
    if (!story[0]) {
      await sql`
        INSERT INTO "StoryState" (
          id, "bookId", "openThreads", "createdAt", "updatedAt"
        ) VALUES (
          ${newRowId()}, ${input.bookId}, ${sql.json(threads as never)}, NOW(), NOW()
        )
      `;
    } else {
      await sql`
        UPDATE "StoryState"
        SET "openThreads" = ${sql.json(threads as never)}, "updatedAt" = NOW()
        WHERE "bookId" = ${input.bookId}
      `;
    }
  }

  return update;
}

export async function refreshChapterCanon(
  sql: Sql,
  bookId: string,
  chapterId: string
) {
  const chapterRows = await sql<
    { summary: string | null; stateSummary: string | null }[]
  >`
    SELECT c.summary, st.summary AS "stateSummary"
    FROM "Chapter" c
    LEFT JOIN "ChapterState" st ON st."chapterId" = c.id
    WHERE c.id = ${chapterId}
    LIMIT 1
  `;
  const sectionSummaries = await sql<{ summary: string | null }[]>`
    SELECT st.summary
    FROM "Section" s
    LEFT JOIN "SectionState" st ON st."sectionId" = s.id
    WHERE s."chapterId" = ${chapterId}
    ORDER BY s.number ASC
  `;

  const summary =
    chapterRows[0]?.stateSummary ||
    sectionSummaries
      .map((s) => s.summary)
      .filter(Boolean)
      .join(" ")
      .slice(0, 1500) ||
    chapterRows[0]?.summary;

  if (summary) {
    await sql`
      UPDATE "Chapter" SET summary = ${summary}, "updatedAt" = NOW()
      WHERE id = ${chapterId}
    `;
    const st = await sql<{ id: string }[]>`
      SELECT id FROM "ChapterState" WHERE "chapterId" = ${chapterId} LIMIT 1
    `;
    if (!st[0]) {
      await sql`
        INSERT INTO "ChapterState" (
          id, "chapterId", summary, "charactersPresent", events, "newFacts", "openThreads", "createdAt", "updatedAt"
        ) VALUES (
          ${newRowId()}, ${chapterId}, ${summary},
          ${sql.json([] as never)}, ${sql.json([] as never)},
          ${sql.json([] as never)}, ${sql.json([] as never)},
          NOW(), NOW()
        )
      `;
    } else {
      await sql`
        UPDATE "ChapterState" SET summary = ${summary}, "updatedAt" = NOW()
        WHERE "chapterId" = ${chapterId}
      `;
    }
  }

  const completed = await sql<
    {
      number: number;
      title: string;
      summary: string | null;
      stateSummary: string | null;
    }[]
  >`
    SELECT c.number, c.title, c.summary, st.summary AS "stateSummary"
    FROM "Chapter" c
    LEFT JOIN "ChapterState" st ON st."chapterId" = c.id
    WHERE c."bookId" = ${bookId} AND c.status = 'COMPLETED'
    ORDER BY c.number ASC
  `;
  const bookSummary = completed
    .map(
      (c) =>
        `Ch ${c.number} ${c.title}: ${c.stateSummary ?? c.summary ?? ""}`
    )
    .join("\n")
    .slice(0, 3000);

  const story = await sql<{ id: string }[]>`
    SELECT id FROM "StoryState" WHERE "bookId" = ${bookId} LIMIT 1
  `;
  if (!story[0]) {
    await sql`
      INSERT INTO "StoryState" (
        id, "bookId", "bookSummary", "plotPhase", "createdAt", "updatedAt"
      ) VALUES (
        ${newRowId()}, ${bookId}, ${bookSummary}, 'in_progress', NOW(), NOW()
      )
    `;
  } else {
    await sql`
      UPDATE "StoryState"
      SET "bookSummary" = ${bookSummary}, "plotPhase" = 'in_progress', "updatedAt" = NOW()
      WHERE "bookId" = ${bookId}
    `;
  }
}

/** True when every section has real content. */
export async function hasIncompleteSections(
  sql: Sql,
  bookId: string
): Promise<boolean> {
  const rows = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM "Section" s
    INNER JOIN "Chapter" c ON c.id = s."chapterId"
    WHERE c."bookId" = ${bookId}
      AND (s.content IS NULL OR s."wordCount" = 0 OR LENGTH(TRIM(COALESCE(s.content, ''))) < 40)
  `;
  return (rows[0]?.n ?? 0) > 0;
}
