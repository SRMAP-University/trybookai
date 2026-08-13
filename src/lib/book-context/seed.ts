import { db } from "@/lib/db";
import { asStringArray, type BookOutlineLike } from "@/lib/book-context/types";

/**
 * Seed BookBible + StoryState + ChapterState rows from outline + book fields.
 * Safe to call repeatedly (upsert / skip existing entities by name).
 */
export async function seedBibleFromOutline(bookId: string) {
  const book = await db.book.findUniqueOrThrow({
    where: { id: bookId },
    include: { chapters: { orderBy: { number: "asc" }, select: { id: true, title: true, summary: true } } },
  });

  const outline = book.outline as BookOutlineLike | null;
  const themes = asStringArray(book.themes);
  const characterNames = asStringArray(book.characters);

  const bible = await db.bookBible.upsert({
    where: { bookId },
    create: {
      bookId,
      styleNotes: book.style,
      worldRules: book.customInstructions,
      themes: themes.length ? themes : undefined,
      mysteries: [],
      meta: {
        synopsis: outline?.synopsis ?? book.description ?? null,
        genre: book.genre,
        audience: book.audience,
        tone: book.tone,
      },
    },
    update: {
      styleNotes: book.style ?? undefined,
      worldRules: book.customInstructions ?? undefined,
      themes: themes.length ? themes : undefined,
      meta: {
        synopsis: outline?.synopsis ?? book.description ?? null,
        genre: book.genre,
        audience: book.audience,
        tone: book.tone,
      },
    },
  });

  const existingChars = await db.bibleCharacter.findMany({
    where: { bibleId: bible.id },
    select: { name: true },
  });
  const existingNames = new Set(existingChars.map((c) => c.name.toLowerCase()));

  for (const name of characterNames) {
    if (existingNames.has(name.toLowerCase())) continue;
    await db.bibleCharacter.create({
      data: { bibleId: bible.id, name, profile: null, aliases: [] },
    });
    existingNames.add(name.toLowerCase());
  }

  // Pull character-like names from chapter titles/summaries as soft hints.
  for (const ch of outline?.chapters ?? []) {
    const blob = `${ch.title ?? ""} ${ch.summary ?? ""}`;
    const maybe = blob.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g) ?? [];
    for (const name of maybe.slice(0, 3)) {
      if (existingNames.has(name.toLowerCase())) continue;
      if (["Chapter", "Section", "The", "And", "With"].includes(name)) continue;
      await db.bibleCharacter.create({
        data: {
          bibleId: bible.id,
          name,
          profile: `Mentioned in outline: ${ch.title ?? "chapter"}`,
          status: "provisional",
        },
      });
      existingNames.add(name.toLowerCase());
    }
  }

  await db.storyState.upsert({
    where: { bookId },
    create: {
      bookId,
      plotPhase: "beginning",
      timelineCursor: "start",
      openThreads: [],
      arcs: [],
      bookSummary: outline?.synopsis ?? book.description ?? null,
    },
    update: {
      bookSummary: outline?.synopsis ?? book.description ?? undefined,
    },
  });

  for (const chapter of book.chapters) {
    await db.chapterState.upsert({
      where: { chapterId: chapter.id },
      create: {
        chapterId: chapter.id,
        summary: chapter.summary,
        charactersPresent: [],
        events: [],
        newFacts: [],
        openThreads: [],
      },
      update: {
        summary: chapter.summary ?? undefined,
      },
    });
  }

  return { bibleId: bible.id };
}
