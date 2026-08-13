import type { Sql } from "./db";
import { asStringArray, newRowId } from "./context-utils";

type OutlineLike = {
  synopsis?: string;
  chapters?: Array<{ title?: string; summary?: string }>;
};

/** Seed BookBible + StoryState + ChapterState after outline save. */
export async function seedBibleFromOutline(sql: Sql, bookId: string) {
  const books = await sql<
    {
      title: string;
      description: string | null;
      genre: string | null;
      style: string | null;
      audience: string | null;
      tone: string | null;
      customInstructions: string | null;
      characters: unknown;
      themes: unknown;
      outline: unknown;
    }[]
  >`
    SELECT title, description, genre, style, audience, tone,
           "customInstructions", characters, themes, outline
    FROM "Book" WHERE id = ${bookId} LIMIT 1
  `;
  const book = books[0];
  if (!book) return;

  const outline = book.outline as OutlineLike | null;
  const themes = asStringArray(book.themes);
  const characterNames = asStringArray(book.characters);
  const meta = {
    synopsis: outline?.synopsis ?? book.description ?? null,
    genre: book.genre,
    audience: book.audience,
    tone: book.tone,
  };

  const existingBible = await sql<{ id: string }[]>`
    SELECT id FROM "BookBible" WHERE "bookId" = ${bookId} LIMIT 1
  `;
  let bibleId = existingBible[0]?.id;
  if (!bibleId) {
    bibleId = newRowId();
    await sql`
      INSERT INTO "BookBible" (
        id, "bookId", "styleNotes", "worldRules", themes, mysteries, meta, "createdAt", "updatedAt"
      ) VALUES (
        ${bibleId},
        ${bookId},
        ${book.style},
        ${book.customInstructions},
        ${sql.json(themes as never)},
        ${sql.json([] as never)},
        ${sql.json(meta as never)},
        NOW(), NOW()
      )
    `;
  } else {
    await sql`
      UPDATE "BookBible"
      SET
        "styleNotes" = ${book.style},
        "worldRules" = ${book.customInstructions},
        themes = ${sql.json(themes as never)},
        meta = ${sql.json(meta as never)},
        "updatedAt" = NOW()
      WHERE id = ${bibleId}
    `;
  }

  const existingChars = await sql<{ name: string }[]>`
    SELECT name FROM "BibleCharacter" WHERE "bibleId" = ${bibleId}
  `;
  const existingNames = new Set(existingChars.map((c) => c.name.toLowerCase()));

  for (const name of characterNames) {
    if (existingNames.has(name.toLowerCase())) continue;
    await sql`
      INSERT INTO "BibleCharacter" (
        id, "bibleId", name, aliases, profile, status, "createdAt", "updatedAt"
      ) VALUES (
        ${newRowId()}, ${bibleId}, ${name}, ${sql.json([] as never)}, NULL, 'active', NOW(), NOW()
      )
    `;
    existingNames.add(name.toLowerCase());
  }

  const story = await sql<{ id: string }[]>`
    SELECT id FROM "StoryState" WHERE "bookId" = ${bookId} LIMIT 1
  `;
  const bookSummary = outline?.synopsis ?? book.description ?? null;
  if (!story[0]) {
    await sql`
      INSERT INTO "StoryState" (
        id, "bookId", "plotPhase", "timelineCursor", "openThreads", arcs, "bookSummary", "createdAt", "updatedAt"
      ) VALUES (
        ${newRowId()}, ${bookId}, 'beginning', 'start',
        ${sql.json([] as never)}, ${sql.json([] as never)}, ${bookSummary}, NOW(), NOW()
      )
    `;
  } else {
    await sql`
      UPDATE "StoryState"
      SET "bookSummary" = ${bookSummary}, "updatedAt" = NOW()
      WHERE "bookId" = ${bookId}
    `;
  }

  const chapters = await sql<{ id: string; summary: string | null }[]>`
    SELECT id, summary FROM "Chapter" WHERE "bookId" = ${bookId}
  `;
  for (const ch of chapters) {
    const st = await sql<{ id: string }[]>`
      SELECT id FROM "ChapterState" WHERE "chapterId" = ${ch.id} LIMIT 1
    `;
    if (!st[0]) {
      await sql`
        INSERT INTO "ChapterState" (
          id, "chapterId", summary, "charactersPresent", events, "newFacts", "openThreads", "createdAt", "updatedAt"
        ) VALUES (
          ${newRowId()}, ${ch.id}, ${ch.summary},
          ${sql.json([] as never)}, ${sql.json([] as never)},
          ${sql.json([] as never)}, ${sql.json([] as never)},
          NOW(), NOW()
        )
      `;
    }
  }
}
