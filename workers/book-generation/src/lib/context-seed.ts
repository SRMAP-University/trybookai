import type { Sql } from "./db";
import { asStringArray, newRowId } from "./context-utils";

type OutlineLike = {
  synopsis?: string;
  characters?: Array<{ name?: string; role?: string; description?: string }>;
  settings?: Array<{ name?: string; description?: string }>;
};

function castProfile(member: { role?: string; description?: string }): string | null {
  const parts = [member.role, member.description].map((p) => p?.trim()).filter(Boolean);
  return parts.length ? parts.join(" — ") : null;
}

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

  // Outline cast first (it carries profiles), then any extra names the user listed.
  const cast = [
    ...(outline?.characters ?? []).map((c) => ({
      name: c.name?.trim() ?? "",
      profile: castProfile(c),
    })),
    ...characterNames.map((name) => ({ name, profile: null })),
  ];
  for (const member of cast) {
    if (!member.name || existingNames.has(member.name.toLowerCase())) continue;
    await sql`
      INSERT INTO "BibleCharacter" (
        id, "bibleId", name, aliases, profile, status, "createdAt", "updatedAt"
      ) VALUES (
        ${newRowId()}, ${bibleId}, ${member.name}, ${sql.json([] as never)},
        ${member.profile}, 'active', NOW(), NOW()
      )
    `;
    existingNames.add(member.name.toLowerCase());
  }

  const existingPlaces = await sql<{ name: string }[]>`
    SELECT name FROM "BibleLocation" WHERE "bibleId" = ${bibleId}
  `;
  const placeNames = new Set(existingPlaces.map((p) => p.name.toLowerCase()));
  for (const place of outline?.settings ?? []) {
    const name = place.name?.trim();
    if (!name || placeNames.has(name.toLowerCase())) continue;
    await sql`
      INSERT INTO "BibleLocation" (id, "bibleId", name, description, "createdAt", "updatedAt")
      VALUES (${newRowId()}, ${bibleId}, ${name}, ${place.description?.trim() || null}, NOW(), NOW())
    `;
    placeNames.add(name.toLowerCase());
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

  // ChapterState holds what has been written; the plan stays in Book.outline.
  const chapters = await sql<{ id: string }[]>`
    SELECT id FROM "Chapter" WHERE "bookId" = ${bookId}
  `;
  for (const ch of chapters) {
    await sql`
      INSERT INTO "ChapterState" (
        id, "chapterId", summary, "charactersPresent", events, "newFacts", "openThreads", "createdAt", "updatedAt"
      ) VALUES (
        ${newRowId()}, ${ch.id}, NULL,
        ${sql.json([] as never)}, ${sql.json([] as never)},
        ${sql.json([] as never)}, ${sql.json([] as never)},
        NOW(), NOW()
      )
      ON CONFLICT ("chapterId") DO NOTHING
    `;
  }
}
