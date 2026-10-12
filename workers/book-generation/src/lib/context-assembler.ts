import type { Sql } from "./db";
import { asStringArray } from "./context-utils";
import {
  composeSectionPrompt,
  type SectionContextInput,
} from "../../../../src/lib/book-generator/core";

/** Load everything the writer needs for one section and compose its prompt. */
export async function assembleSectionContext(
  sql: Sql,
  bookId: string,
  sectionId: string
) {
  const rows = await sql<
    {
      number: number;
      title: string;
      chapterId: string;
      chapterNumber: number;
      chapterTitle: string;
      chapterSummary: string | null;
      bookTitle: string;
      description: string | null;
      genre: string | null;
      outline: unknown;
      style: string | null;
      audience: string | null;
      tone: string | null;
      pov: string;
      tense: string;
      language: string;
      includeDialogue: boolean;
      includeExamples: boolean;
      customInstructions: string | null;
      forbiddenTopics: string | null;
      templateId: string | null;
      characters: unknown;
      themes: unknown;
      targetPages: number;
      wordsPerPage: number;
    }[]
  >`
    SELECT
      s.number, s.title,
      c.id AS "chapterId", c.number AS "chapterNumber", c.title AS "chapterTitle",
      c.summary AS "chapterSummary",
      b.title AS "bookTitle", b.description, b.genre, b.outline, b.style,
      b.audience, b.tone, b.pov, b.tense, b.language,
      b."includeDialogue", b."includeExamples", b."customInstructions",
      b."forbiddenTopics", b."templateId", b.characters, b.themes,
      b."targetPages", b."wordsPerPage"
    FROM "Section" s
    INNER JOIN "Chapter" c ON c.id = s."chapterId"
    INNER JOIN "Book" b ON b.id = c."bookId"
    WHERE s.id = ${sectionId} AND c."bookId" = ${bookId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error(`Section ${sectionId} not found`);

  const [bible] = await sql<
    { id: string; styleNotes: string | null; worldRules: string | null; themes: unknown }[]
  >`
    SELECT id, "styleNotes", "worldRules", themes FROM "BookBible"
    WHERE "bookId" = ${bookId} LIMIT 1
  `;
  const [story] = await sql<{ openThreads: unknown }[]>`
    SELECT "openThreads" FROM "StoryState" WHERE "bookId" = ${bookId} LIMIT 1
  `;
  const [chState] = await sql<{ location: string | null; charactersPresent: unknown }[]>`
    SELECT location, "charactersPresent" FROM "ChapterState"
    WHERE "chapterId" = ${row.chapterId} LIMIT 1
  `;

  const siblings = await sql<
    { number: number; title: string; wordCount: number; summary: string | null }[]
  >`
    SELECT s.number, s.title, s."wordCount", st.summary
    FROM "Section" s
    LEFT JOIN "SectionState" st ON st."sectionId" = s.id
    WHERE s."chapterId" = ${row.chapterId}
    ORDER BY s.number ASC
  `;

  const chapters = await sql<
    { number: number; title: string; summary: string | null }[]
  >`
    SELECT number, title, summary FROM "Chapter"
    WHERE "bookId" = ${bookId}
    ORDER BY number ASC
  `;

  const [position] = await sql<{ total: number; before: number }[]>`
    SELECT
      COUNT(*)::int AS total,
      (COUNT(*) FILTER (
        WHERE c.number < ${row.chapterNumber}
          OR (c.number = ${row.chapterNumber} AND s.number < ${row.number})
      ))::int AS before
    FROM "Section" s
    INNER JOIN "Chapter" c ON c.id = s."chapterId"
    WHERE c."bookId" = ${bookId}
  `;

  const [prevInChapter] = await sql<{ content: string | null }[]>`
    SELECT content FROM "Section"
    WHERE "chapterId" = ${row.chapterId} AND number < ${row.number} AND "wordCount" > 0
    ORDER BY number DESC
    LIMIT 1
  `;
  const [prevChapterEnd] = prevInChapter?.content
    ? [undefined]
    : await sql<{ content: string | null }[]>`
        SELECT s.content
        FROM "Section" s
        INNER JOIN "Chapter" c ON c.id = s."chapterId"
        WHERE c."bookId" = ${bookId} AND c.number < ${row.chapterNumber} AND s."wordCount" > 0
        ORDER BY c.number DESC, s.number DESC
        LIMIT 1
      `;

  let characters: { name: string; profile: string | null; aliases: unknown }[] = [];
  let locations: { name: string; description: string | null }[] = [];
  let factions: { name: string }[] = [];
  if (bible) {
    characters = await sql`
      SELECT name, profile, aliases FROM "BibleCharacter"
      WHERE "bibleId" = ${bible.id}
      ORDER BY "createdAt" ASC
      LIMIT 60
    `;
    locations = await sql`
      SELECT name, description FROM "BibleLocation"
      WHERE "bibleId" = ${bible.id}
      ORDER BY "createdAt" ASC
      LIMIT 40
    `;
    factions = await sql`
      SELECT name FROM "BibleFaction" WHERE "bibleId" = ${bible.id} LIMIT 12
    `;
  }

  const facts = await sql<{ subject: string; predicate: string; object: string }[]>`
    SELECT subject, predicate, object FROM "CanonFact"
    WHERE "bookId" = ${bookId} AND status = 'CANON'
    ORDER BY "updatedAt" DESC
    LIMIT 80
  `;

  const next = chapters.find((c) => c.number > row.chapterNumber) ?? null;
  const previousContent = prevInChapter?.content ?? prevChapterEnd?.content ?? null;
  const openThreads = asStringArray(story?.openThreads);

  const input: SectionContextInput = {
    book: {
      title: row.bookTitle,
      genre: row.genre,
      description: row.description,
      templateId: row.templateId,
      pov: row.pov,
      tense: row.tense,
      language: row.language,
      tone: row.tone,
      audience: row.audience,
      style: row.style,
      customInstructions: row.customInstructions,
      forbiddenTopics: row.forbiddenTopics,
      includeDialogue: row.includeDialogue,
      includeExamples: row.includeExamples,
      characters: row.characters,
      themes: row.themes,
      targetPages: row.targetPages,
      wordsPerPage: row.wordsPerPage,
    },
    outline: row.outline,
    bible: bible
      ? { styleNotes: bible.styleNotes, worldRules: bible.worldRules, themes: bible.themes }
      : null,
    characters,
    locations,
    factions: factions.map((f) => f.name),
    facts,
    openThreads,
    totalChapters: chapters.length,
    chapter: {
      number: row.chapterNumber,
      title: row.chapterTitle,
      summary: row.chapterSummary,
      location: chState?.location ?? null,
      charactersPresent: chState?.charactersPresent,
    },
    nextChapter: next,
    priorChapters: chapters.filter((c) => c.number < row.chapterNumber),
    chapterSections: siblings.map((s) => ({
      number: s.number,
      title: s.title,
      done: s.wordCount > 0,
      summary: s.summary,
    })),
    section: { number: row.number, title: row.title },
    previousText: previousContent
      ? { content: previousContent, fromPreviousChapter: !prevInChapter?.content }
      : null,
    bookPosition: { index: position?.before ?? 0, total: position?.total ?? 1 },
  };

  return {
    ...composeSectionPrompt(input),
    chapterId: row.chapterId,
    chapterTitle: row.chapterTitle,
    sectionTitle: row.title,
    openThreads,
  };
}
