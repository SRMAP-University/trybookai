import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureAudioGenerationRunning } from "@/lib/audio-generator/background";
import { normalizeVoiceSettings } from "@/lib/elevenlabs-voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const voiceSettingsSchema = z
  .object({
    stability: z.number().min(0).max(1).optional(),
    similarityBoost: z.number().min(0).max(1).optional(),
    style: z.number().min(0).max(1).optional(),
    speed: z.number().min(0.7).max(1.2).optional(),
    useSpeakerBoost: z.boolean().optional(),
    modelId: z.string().optional(),
  })
  .optional();

const startSchema = z.object({
  bookId: z.string().min(1),
  type: z.enum(["AUDIOBOOK", "PODCAST", "MUSIC"]),
  voiceId: z.string().optional(),
  voiceName: z.string().optional(),
  voiceSettings: voiceSettingsSchema,
  regenerate: z.boolean().optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bookId = new URL(request.url).searchParams.get("bookId");
  if (!bookId) {
    return NextResponse.json({ error: "bookId required" }, { status: 400 });
  }

  const book = await db.book.findFirst({
    where: { id: bookId, userId: session.user.id },
    select: { id: true },
  });
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const audios = await db.bookAudio.findMany({
    where: { bookId },
    orderBy: { createdAt: "desc" },
    include: {
      tracks: { orderBy: { number: "asc" } },
    },
  });

  return NextResponse.json({ audios });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await ensureAudioGenerationRunning({
      bookId: parsed.data.bookId,
      userId: session.user.id,
      type: parsed.data.type,
      voiceId: parsed.data.voiceId,
      voiceName: parsed.data.voiceName,
      voiceSettings: parsed.data.voiceSettings
        ? normalizeVoiceSettings(parsed.data.voiceSettings)
        : undefined,
      regenerate: parsed.data.regenerate,
    });

    return NextResponse.json({
      audio: result.audio,
      started: result.started,
      alreadyRunning: result.alreadyRunning,
      completed: "completed" in result ? result.completed : false,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start audio generation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
