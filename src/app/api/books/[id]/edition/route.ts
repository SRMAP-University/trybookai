import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createBookSlug } from "@/lib/book-public";
import {
  formatEditionTitle,
  getEditionBaseTitle,
  getEditionRootId,
} from "@/lib/book-editions";
import { ensureGenerationRunning } from "@/lib/book-generator/background";
import { z } from "zod";

const editionSchema = z.object({
  startGeneration: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const source = await db.book.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!source) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = editionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const rootId = getEditionRootId(source);
  const family = await db.book.findMany({
    where: {
      userId: session.user.id,
      OR: [{ id: rootId }, { parentBookId: rootId }],
    },
    select: { edition: true },
  });

  const nextEdition =
    family.reduce((max, book) => Math.max(max, book.edition), 0) + 1;
  const baseTitle = getEditionBaseTitle(source.title);
  const title = formatEditionTitle(baseTitle, nextEdition);

  let book;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      book = await db.book.create({
        data: {
          userId: session.user.id,
          slug: createBookSlug(title),
          isPublic: source.isPublic,
          title,
          description: source.description,
          genre: source.genre,
          targetPages: source.targetPages,
          tone: source.tone,
          audience: source.audience,
          style: source.style,
          pov: source.pov,
          tense: source.tense,
          language: source.language,
          chapterCount: source.chapterCount,
          sectionsPerChapter: source.sectionsPerChapter,
          wordsPerPage: source.wordsPerPage,
          includeDialogue: source.includeDialogue,
          includeExamples: source.includeExamples,
          customInstructions: source.customInstructions,
          characters: source.characters ?? undefined,
          themes: source.themes ?? undefined,
          forbiddenTopics: source.forbiddenTopics,
          model: source.model,
          creativity: source.creativity,
          templateId: source.templateId,
          edition: nextEdition,
          parentBookId: rootId,
          status: "DRAFT",
        },
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!book) {
    console.error(lastError);
    return NextResponse.json(
      { error: "Could not create edition with a unique public ID." },
      { status: 500 }
    );
  }

  if (parsed.data.startGeneration) {
    try {
      await ensureGenerationRunning(book.id, session.user.id);
    } catch (error) {
      console.error("Failed to start edition generation:", error);
    }
    return NextResponse.json({ ...book, startStream: true }, { status: 201 });
  }

  return NextResponse.json(book, { status: 201 });
}
