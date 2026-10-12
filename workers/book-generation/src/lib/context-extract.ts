import type { Sql } from "./db";
import { OUTLINE_CF_MODEL, runAi } from "./ai";
import { newRowId } from "./context-utils";
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
} from "../../../../src/lib/book-generator/core";

/** Ledger pass over a draft. Pure: nothing is stored until the final draft is chosen. */
export async function extractSectionUpdate(
  ai: Ai,
  input: {
    sectionTitle: string;
    content: string;
    knownFacts?: string;
    openThreads?: string[];
  }
): Promise<SectionUpdate> {
  const raw = await runAi(ai, OUTLINE_CF_MODEL, buildExtractMessages(input), {
    max_tokens: 1400,
    temperature: 0.2,
  });
  return parseSectionUpdate(raw);
}

/** Store a section's ledger entry and fold it into chapter, canon and story state. */
export async function applySectionUpdate(
  sql: Sql,
  ids: { bookId: string; chapterId: string; sectionId: string },
  update: SectionUpdate
) {
  await sql`
    INSERT INTO "SectionState" (
      id, "sectionId", summary, objective, "charactersPresent", "createdAt", "updatedAt"
    ) VALUES (
      ${newRowId()}, ${ids.sectionId}, ${update.sectionSummary},
      ${update.objective ?? null}, ${sql.json(update.charactersPresent as never)},
      NOW(), NOW()
    )
    ON CONFLICT ("sectionId") DO UPDATE SET
      summary = EXCLUDED.summary,
      objective = EXCLUDED.objective,
      "charactersPresent" = EXCLUDED."charactersPresent",
      "updatedAt" = NOW()
  `;

  const [prev] = await sql<
    {
      summary: string | null;
      charactersPresent: unknown;
      location: string | null;
      events: unknown;
      newFacts: unknown;
      openThreads: unknown;
    }[]
  >`
    SELECT summary, "charactersPresent", location, events, "newFacts", "openThreads"
    FROM "ChapterState" WHERE "chapterId" = ${ids.chapterId} LIMIT 1
  `;
  const merged = mergeChapterState(prev, update);
  await sql`
    INSERT INTO "ChapterState" (
      id, "chapterId", summary, "charactersPresent", location, events, "newFacts", "openThreads", "createdAt", "updatedAt"
    ) VALUES (
      ${newRowId()}, ${ids.chapterId}, ${merged.summary},
      ${sql.json(merged.charactersPresent as never)},
      ${merged.location},
      ${sql.json(merged.events as never)},
      ${sql.json(merged.newFacts as never)},
      ${sql.json(merged.openThreads as never)},
      NOW(), NOW()
    )
    ON CONFLICT ("chapterId") DO UPDATE SET
      summary = EXCLUDED.summary,
      "charactersPresent" = EXCLUDED."charactersPresent",
      location = EXCLUDED.location,
      events = EXCLUDED.events,
      "newFacts" = EXCLUDED."newFacts",
      "openThreads" = EXCLUDED."openThreads",
      "updatedAt" = NOW()
  `;

  for (const fact of update.newFacts) {
    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM "CanonFact"
      WHERE "bookId" = ${ids.bookId}
        AND LOWER(subject) = LOWER(${fact.subject})
        AND LOWER(predicate) = LOWER(${fact.predicate})
        AND LOWER(object) = LOWER(${fact.object})
      LIMIT 1
    `;
    if (existing) {
      await sql`
        UPDATE "CanonFact"
        SET status = 'CANON',
            "sourceChapterId" = ${ids.chapterId},
            "sourceSectionId" = ${ids.sectionId},
            confidence = 0.8,
            "updatedAt" = NOW()
        WHERE id = ${existing.id}
      `;
    } else {
      await sql`
        INSERT INTO "CanonFact" (
          id, "bookId", subject, predicate, object, status,
          "sourceChapterId", "sourceSectionId", confidence, "createdAt", "updatedAt"
        ) VALUES (
          ${newRowId()}, ${ids.bookId}, ${fact.subject}, ${fact.predicate}, ${fact.object},
          'CANON', ${ids.chapterId}, ${ids.sectionId}, 0.75, NOW(), NOW()
        )
      `;
    }
  }

  if (update.openThreads.length || update.resolvedThreads.length) {
    const [story] = await sql<{ openThreads: unknown }[]>`
      SELECT "openThreads" FROM "StoryState" WHERE "bookId" = ${ids.bookId} LIMIT 1
    `;
    const threads = mergeThreads(story?.openThreads, update, 20);
    await sql`
      INSERT INTO "StoryState" (id, "bookId", "openThreads", "createdAt", "updatedAt")
      VALUES (${newRowId()}, ${ids.bookId}, ${sql.json(threads as never)}, NOW(), NOW())
      ON CONFLICT ("bookId") DO UPDATE SET
        "openThreads" = EXCLUDED."openThreads",
        "updatedAt" = NOW()
    `;
  }
}

/** After a chapter completes, compress it into Chapter.summary and refresh the book summary. */
export async function refreshChapterCanon(
  sql: Sql,
  ai: Ai,
  bookId: string,
  chapterId: string
) {
  const [chapter] = await sql<{ number: number; title: string; summary: string | null }[]>`
    SELECT number, title, summary FROM "Chapter" WHERE id = ${chapterId} LIMIT 1
  `;
  if (!chapter) return;

  const sectionRows = await sql<{ summary: string | null }[]>`
    SELECT st.summary
    FROM "Section" s
    LEFT JOIN "SectionState" st ON st."sectionId" = s.id
    WHERE s."chapterId" = ${chapterId}
    ORDER BY s.number ASC
  `;
  const sectionSummaries = sectionRows
    .map((s) => s.summary ?? "")
    .filter(Boolean);

  let summary = "";
  if (sectionSummaries.length) {
    try {
      summary = cleanChapterSummary(
        await runAi(
          ai,
          OUTLINE_CF_MODEL,
          buildChapterSummaryMessages(chapter, sectionSummaries),
          { max_tokens: 500, temperature: 0.2 }
        )
      );
    } catch (error) {
      console.warn(
        `[canon] chapter summary failed for ${chapterId}:`,
        error instanceof Error ? error.message : error
      );
    }
    summary ||= fallbackChapterSummary(sectionSummaries);
  }

  if (summary) {
    await sql`
      UPDATE "Chapter" SET summary = ${summary}, "updatedAt" = NOW()
      WHERE id = ${chapterId}
    `;
    await sql`
      INSERT INTO "ChapterState" (
        id, "chapterId", summary, "charactersPresent", events, "newFacts", "openThreads", "createdAt", "updatedAt"
      ) VALUES (
        ${newRowId()}, ${chapterId}, ${summary},
        ${sql.json([] as never)}, ${sql.json([] as never)},
        ${sql.json([] as never)}, ${sql.json([] as never)},
        NOW(), NOW()
      )
      ON CONFLICT ("chapterId") DO UPDATE SET summary = EXCLUDED.summary, "updatedAt" = NOW()
    `;
  }

  const completed = await sql<{ number: number; title: string; summary: string | null }[]>`
    SELECT number, title, summary FROM "Chapter"
    WHERE "bookId" = ${bookId} AND status = 'COMPLETED'
    ORDER BY number ASC
  `;
  const bookSummary = composeStorySoFar(completed, 3000);
  await sql`
    INSERT INTO "StoryState" (id, "bookId", "bookSummary", "plotPhase", "createdAt", "updatedAt")
    VALUES (${newRowId()}, ${bookId}, ${bookSummary}, 'in_progress', NOW(), NOW())
    ON CONFLICT ("bookId") DO UPDATE SET
      "bookSummary" = EXCLUDED."bookSummary",
      "plotPhase" = EXCLUDED."plotPhase",
      "updatedAt" = NOW()
  `;
}

/** True when any section lacks real content. */
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
