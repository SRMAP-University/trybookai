import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createBookSlug } from "@/lib/book-public";
import { syncUserTrialState } from "@/lib/billing";
import { ensureAudioGenerationRunning } from "@/lib/audio-generator/background";
import {
  SONG_STUDIO_GENRE,
  SONG_STUDIO_MAX_PROMPT,
  SONG_STUDIO_MIN_PROMPT,
} from "@/lib/song-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const startSchema = z.object({
  title: z.string().min(1).max(200),
  style: z.string().max(80).optional(),
  mood: z.string().max(80).optional(),
  prompt: z.string().min(SONG_STUDIO_MIN_PROMPT).max(SONG_STUDIO_MAX_PROMPT),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await db.book.findMany({
    where: {
      userId: session.user.id,
      genre: SONG_STUDIO_GENRE,
    },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: {
      id: true,
      title: true,
      status: true,
      tone: true,
      customInstructions: true,
      createdAt: true,
      updatedAt: true,
      audios: {
        where: { type: "SONG" },
        orderBy: { createdAt: "desc" },
        include: {
          tracks: { orderBy: { number: "asc" } },
        },
      },
    },
  });

  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await syncUserTrialState(session.user.id);

  const body = await request.json().catch(() => null);
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Add a title and a short song brief or lyrics." },
      { status: 400 }
    );
  }

  const title = parsed.data.title.trim();
  const style = parsed.data.style?.trim() || "";
  const mood = parsed.data.mood?.trim() || "";
  const prompt = parsed.data.prompt.trim();

  let book;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      book = await db.book.create({
        data: {
          userId: session.user.id,
          slug: createBookSlug(title),
          title,
          description: prompt,
          genre: SONG_STUDIO_GENRE,
          tone: mood || null,
          isPublic: false,
          status: "COMPLETED",
          progress: 100,
          targetPages: 1,
          currentPages: 1,
          chapterCount: 1,
          completedAt: new Date(),
          customInstructions: `song-studio:${style}`,
          chapters: {
            create: {
              number: 1,
              title: "Lyrics brief",
              summary: prompt.slice(0, 280),
              content: prompt,
              pageCount: 1,
              status: "COMPLETED",
              sections: {
                create: {
                  number: 1,
                  title: "Lyrics brief",
                  content: prompt,
                  pageCount: 1,
                  wordCount: prompt.split(/\s+/).filter(Boolean).length,
                },
              },
            },
          },
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
      { error: "Could not create Song Studio project." },
      { status: 500 }
    );
  }

  try {
    const result = await ensureAudioGenerationRunning({
      bookId: book.id,
      userId: session.user.id,
      type: "SONG",
    });

    return NextResponse.json(
      {
        bookId: book.id,
        audio: result.audio,
        started: result.started,
        alreadyRunning: result.alreadyRunning,
        completed: "completed" in result ? result.completed : false,
      },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start song generation";
    return NextResponse.json({ bookId: book.id, error: message }, { status: 400 });
  }
}
