import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createBookSlug } from "@/lib/book-public";
import { DEFAULT_AI_MODEL, isModelAvailable } from "@/lib/ai-models";
import { ensureGenerationRunning } from "@/lib/book-generator/background";
import { maxBookPagesForUser, syncUserTrialState } from "@/lib/billing";
import { z } from "zod";

const createBookSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  genre: z.string().optional(),
  targetPages: z.number().min(3).max(1000),
  tone: z.string().optional(),
  audience: z.string().max(200).optional(),
  style: z.string().max(5000).optional(),
  pov: z.string().optional(),
  tense: z.string().optional(),
  language: z.string().optional(),
  chapterCount: z.number().min(1).max(100).nullable().optional(),
  sectionsPerChapter: z.number().min(2).max(8).optional(),
  wordsPerPage: z.number().min(150).max(500).optional(),
  includeDialogue: z.boolean().optional(),
  includeExamples: z.boolean().optional(),
  customInstructions: z.string().max(5000).optional(),
  characters: z.array(z.string().max(200)).max(30).optional(),
  themes: z.array(z.string().max(100)).max(20).optional(),
  forbiddenTopics: z.string().max(2000).optional(),
  model: z.string().optional(),
  creativity: z.number().min(0).max(2).optional(),
  templateId: z.string().optional(),
  startGeneration: z.boolean().optional(),
  generateAudiobookOnComplete: z.boolean().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const books = await db.book.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { chapters: true } },
    },
  });

  return NextResponse.json(books);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createBookSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const user = await syncUserTrialState(session.user.id);

  const maxPages = maxBookPagesForUser(user);
  if (parsed.data.targetPages > maxPages) {
    return NextResponse.json(
      {
        error: `Your plan allows up to ${maxPages} pages per book. Upgrade to generate longer books.`,
      },
      { status: 403 }
    );
  }

  if (parsed.data.model && !isModelAvailable(parsed.data.model, user.plan)) {
    return NextResponse.json(
      { error: "This model requires a Pro or Enterprise plan." },
      { status: 403 }
    );
  }

  const {
    startGeneration: shouldStart,
    generateAudiobookOnComplete,
    characters,
    themes,
    ...bookData
  } = parsed.data;

  let book;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      book = await db.book.create({
        data: {
          userId: session.user.id,
          slug: createBookSlug(bookData.title),
          isPublic: true,
          ...bookData,
          generateAudiobookOnComplete: Boolean(generateAudiobookOnComplete),
          characters: characters ?? undefined,
          themes: themes ?? undefined,
          pov: bookData.pov ?? user.defaultPov,
          tense: bookData.tense ?? user.defaultTense,
          language: bookData.language ?? user.defaultLanguage,
          model: bookData.model ?? user.defaultModel ?? DEFAULT_AI_MODEL,
          creativity: bookData.creativity ?? user.defaultCreativity,
          wordsPerPage: bookData.wordsPerPage ?? user.defaultWordsPerPage,
          sectionsPerChapter:
            bookData.sectionsPerChapter ?? user.defaultSectionsPerChapter,
          style: bookData.style ?? user.styleGuide ?? undefined,
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
      { error: "Could not create book with a unique public ID." },
      { status: 500 }
    );
  }

  if (shouldStart || user.autoGenerateOnCreate) {
    try {
      await ensureGenerationRunning(book.id, session.user.id);
    } catch (error) {
      console.error("Failed to start background generation:", error);
    }
    return NextResponse.json({ ...book, startStream: true }, { status: 201 });
  }

  return NextResponse.json(book, { status: 201 });
}
