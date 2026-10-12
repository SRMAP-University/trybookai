import { db } from "@/lib/db";
import { asStringArray, type BookOutline } from "@/lib/book-generator/core";

type OutlineLike = Partial<Pick<BookOutline, "synopsis" | "characters" | "settings">>;

function castProfile(member: { role?: string; description?: string }): string | null {
  const parts = [member.role, member.description].map((p) => p?.trim()).filter(Boolean);
  return parts.length ? parts.join(" — ") : null;
}

/**
 * Seed BookBible + StoryState + ChapterState rows from outline + book fields.
 * Safe to call repeatedly (upsert / skip existing entities by name).
 */
export async function seedBibleFromOutline(bookId: string) {
  const book = await db.book.findUniqueOrThrow({
    where: { id: bookId },
    include: { chapters: { select: { id: true } } },
  });

  const outline = book.outline as OutlineLike | null;
  const themes = asStringArray(book.themes);
  const meta = {
    synopsis: outline?.synopsis ?? book.description ?? null,
    genre: book.genre,
    audience: book.audience,
    tone: book.tone,
  };

  const bible = await db.bookBible.upsert({
    where: { bookId },
    create: {
      bookId,
      styleNotes: book.style,
      worldRules: book.customInstructions,
      themes: themes.length ? themes : undefined,
      mysteries: [],
      meta,
    },
    update: {
      styleNotes: book.style ?? undefined,
      worldRules: book.customInstructions ?? undefined,
      themes: themes.length ? themes : undefined,
      meta,
    },
  });

  const existingChars = await db.bibleCharacter.findMany({
    where: { bibleId: bible.id },
    select: { name: true },
  });
  const existingNames = new Set(existingChars.map((c) => c.name.toLowerCase()));

  // Outline cast first (it carries profiles), then any extra names the user listed.
  const cast = [
    ...(outline?.characters ?? []).map((c) => ({
      name: c.name?.trim() ?? "",
      profile: castProfile(c),
    })),
    ...asStringArray(book.characters).map((name) => ({ name, profile: null })),
  ];
  for (const member of cast) {
    if (!member.name || existingNames.has(member.name.toLowerCase())) continue;
    await db.bibleCharacter.create({
      data: { bibleId: bible.id, name: member.name, profile: member.profile, aliases: [] },
    });
    existingNames.add(member.name.toLowerCase());
  }

  const existingPlaces = await db.bibleLocation.findMany({
    where: { bibleId: bible.id },
    select: { name: true },
  });
  const placeNames = new Set(existingPlaces.map((p) => p.name.toLowerCase()));
  for (const place of outline?.settings ?? []) {
    const name = place.name?.trim();
    if (!name || placeNames.has(name.toLowerCase())) continue;
    await db.bibleLocation.create({
      data: { bibleId: bible.id, name, description: place.description?.trim() || null },
    });
    placeNames.add(name.toLowerCase());
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

  // ChapterState holds what has been written; the plan stays in Book.outline.
  for (const chapter of book.chapters) {
    await db.chapterState.upsert({
      where: { chapterId: chapter.id },
      create: {
        chapterId: chapter.id,
        charactersPresent: [],
        events: [],
        newFacts: [],
        openThreads: [],
      },
      update: {},
    });
  }

  return { bibleId: bible.id };
}
