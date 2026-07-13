import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createBookSlug } from "@/lib/book-public";
import { syncUserTrialState } from "@/lib/billing";
import { ensureAudioGenerationRunning } from "@/lib/audio-generator/background";
import { normalizeVoiceSettings } from "@/lib/elevenlabs-voices";
import {
  AUDIO_STUDIO_GENRE,
  AUDIO_STUDIO_MAX_CHARS,
  AUDIO_STUDIO_MAX_PDF_BYTES,
  AUDIO_STUDIO_MIN_WORDS,
  countWords,
  extractPdfText,
  splitTextIntoChapters,
} from "@/lib/audio-studio";

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
  title: z.string().min(1).max(200),
  text: z.string().max(AUDIO_STUDIO_MAX_CHARS).optional(),
  type: z.enum(["AUDIOBOOK", "PODCAST"]),
  voiceId: z.string().optional(),
  voiceName: z.string().optional(),
  voiceSettings: voiceSettingsSchema,
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await db.book.findMany({
    where: {
      userId: session.user.id,
      genre: AUDIO_STUDIO_GENRE,
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: {
      id: true,
      title: true,
      status: true,
      currentPages: true,
      createdAt: true,
      updatedAt: true,
      audios: {
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

  const contentType = request.headers.get("content-type") ?? "";
  let title: string;
  let type: "AUDIOBOOK" | "PODCAST";
  let voiceId: string | undefined;
  let voiceName: string | undefined;
  let voiceSettings: z.infer<typeof voiceSettingsSchema>;
  let sourceText = "";
  let sourceLabel = "text";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      title = String(form.get("title") ?? "").trim();
      type = String(form.get("type") ?? "AUDIOBOOK") as "AUDIOBOOK" | "PODCAST";
      voiceId = optionalString(form.get("voiceId"));
      voiceName = optionalString(form.get("voiceName"));
      const settingsRaw = optionalString(form.get("voiceSettings"));
      voiceSettings = settingsRaw
        ? voiceSettingsSchema.parse(JSON.parse(settingsRaw))
        : undefined;

      const pasted = optionalString(form.get("text")) ?? "";
      const file = form.get("file");

      if (file instanceof File && file.size > 0) {
        if (file.size > AUDIO_STUDIO_MAX_PDF_BYTES) {
          return NextResponse.json(
            { error: "PDF must be 12 MB or smaller." },
            { status: 400 }
          );
        }
        const name = file.name.toLowerCase();
        if (!name.endsWith(".pdf") && file.type !== "application/pdf") {
          return NextResponse.json(
            { error: "Only PDF uploads are supported." },
            { status: 400 }
          );
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        sourceText = await extractPdfText(buffer);
        sourceLabel = "pdf";
        if (!sourceText) {
          return NextResponse.json(
            {
              error:
                "Could not extract text from this PDF. Try a text-based PDF or paste the text instead.",
            },
            { status: 400 }
          );
        }
      } else {
        sourceText = pasted;
      }
    } else {
      const body = await request.json().catch(() => null);
      const parsed = startSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid request", details: parsed.error.flatten() },
          { status: 400 }
        );
      }
      title = parsed.data.title.trim();
      type = parsed.data.type;
      voiceId = parsed.data.voiceId;
      voiceName = parsed.data.voiceName;
      voiceSettings = parsed.data.voiceSettings;
      sourceText = parsed.data.text?.trim() ?? "";
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not read upload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  if (type !== "AUDIOBOOK" && type !== "PODCAST") {
    return NextResponse.json(
      { error: "Type must be AUDIOBOOK or PODCAST." },
      { status: 400 }
    );
  }
  if (!sourceText.trim()) {
    return NextResponse.json(
      { error: "Paste text or upload a PDF to generate audio." },
      { status: 400 }
    );
  }
  if (sourceText.length > AUDIO_STUDIO_MAX_CHARS) {
    return NextResponse.json(
      {
        error: `Text is too long (max ${AUDIO_STUDIO_MAX_CHARS.toLocaleString()} characters).`,
      },
      { status: 400 }
    );
  }

  const wordCount = countWords(sourceText);
  if (wordCount < AUDIO_STUDIO_MIN_WORDS) {
    return NextResponse.json(
      {
        error: `Need at least ${AUDIO_STUDIO_MIN_WORDS} words (found ${wordCount}).`,
      },
      { status: 400 }
    );
  }

  const chapters = splitTextIntoChapters(sourceText);
  if (chapters.length === 0) {
    return NextResponse.json(
      { error: "Could not split text into narratable parts." },
      { status: 400 }
    );
  }

  const wordsPerPage = 300;
  const pageCount = Math.max(1, Math.ceil(wordCount / wordsPerPage));

  let book;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      book = await db.book.create({
        data: {
          userId: session.user.id,
          slug: createBookSlug(title),
          title,
          description: `Audio Studio · ${sourceLabel} · ${type === "PODCAST" ? "Podcast" : "Audiobook"}`,
          genre: AUDIO_STUDIO_GENRE,
          isPublic: false,
          status: "COMPLETED",
          progress: 100,
          targetPages: pageCount,
          currentPages: pageCount,
          chapterCount: chapters.length,
          wordsPerPage,
          completedAt: new Date(),
          customInstructions: `audio-studio:${sourceLabel}`,
          chapters: {
            create: chapters.map((chapter, index) => {
              const sectionWords = countWords(chapter.content);
              const sectionPages = Math.max(
                1,
                Math.ceil(sectionWords / wordsPerPage)
              );
              return {
                number: index + 1,
                title: chapter.title,
                summary: chapter.content.slice(0, 280),
                content: chapter.content,
                pageCount: sectionPages,
                status: "COMPLETED" as const,
                sections: {
                  create: [
                    {
                      number: 1,
                      title: chapter.title,
                      content: chapter.content,
                      pageCount: sectionPages,
                      wordCount: sectionWords,
                    },
                  ],
                },
              };
            }),
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
      { error: "Could not create Audio Studio project." },
      { status: 500 }
    );
  }

  try {
    const result = await ensureAudioGenerationRunning({
      bookId: book.id,
      userId: session.user.id,
      type,
      voiceId,
      voiceName,
      voiceSettings: voiceSettings
        ? normalizeVoiceSettings(voiceSettings)
        : undefined,
    });

    return NextResponse.json(
      {
        bookId: book.id,
        book,
        audio: result.audio,
        started: result.started,
        alreadyRunning: result.alreadyRunning,
        completed: "completed" in result ? result.completed : false,
        chapters: chapters.length,
        wordCount,
        pageCount,
      },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start audio generation";
    return NextResponse.json(
      {
        bookId: book.id,
        error: message,
        chapters: chapters.length,
        wordCount,
      },
      { status: 400 }
    );
  }
}

function optionalString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
