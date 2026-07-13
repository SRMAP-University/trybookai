import { db } from "@/lib/db";
import type { AudioDerivativeType } from "@/generated/prisma/client";
import {
  createChatCompletion,
  extractJsonPayload,
  extractModelText,
} from "@/lib/book-generator/llm";
import {
  generateMusic,
  isElevenLabsConfigured,
  textToSpeechLong,
  type TtsOptions,
} from "@/lib/elevenlabs";
import {
  normalizeVoiceSettings,
  parseStoredVoiceSettings,
  resolveVoice,
  type VoiceSettingsConfig,
} from "@/lib/elevenlabs-voices";
import {
  estimateAudioMinutesFromText,
  formatAudioMinutes,
} from "@/lib/audio-quota";
import { PLANS } from "@/lib/constants";
import { uploadAudioToR2, uploadFullAudioToR2 } from "@/lib/r2";
import {
  createAudioEventEmitter,
  type AudioStreamEmitter,
} from "@/lib/audio-generator/events";

function chapterNarrationText(chapter: {
  number: number;
  title: string;
  sections: { number: number; title: string; content: string | null }[];
}): string {
  const parts = [`Chapter ${chapter.number}. ${chapter.title}.`];
  for (const section of chapter.sections) {
    const body = section.content?.trim();
    if (!body) continue;
    parts.push(`${section.title}. ${body}`);
  }
  return parts.join("\n\n");
}

async function assertAudioQuota(userId: string, estimatedMinutes: number) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const limit =
    user.audioMinutesLimit ||
    PLANS[user.plan as keyof typeof PLANS]?.audioMinutesLimit ||
    0;
  const remaining = limit - user.audioMinutesUsed;

  if (limit <= 0) {
    throw new Error(
      "Audiobook narration requires Pro ($20/mo) or Premium ($30/mo)."
    );
  }

  if (estimatedMinutes > remaining) {
    throw new Error(
      `Not enough audiobook time. This needs ~${formatAudioMinutes(estimatedMinutes)}, but you have ${formatAudioMinutes(Math.max(0, remaining))} left this month.`
    );
  }

  return user;
}

async function creditAudioMinutes(userId: string, minutes: number) {
  if (minutes <= 0) return;
  await db.user.update({
    where: { id: userId },
    data: { audioMinutesUsed: { increment: minutes } },
  });
}

async function saveTrack(params: {
  bookId: string;
  audioId: string;
  number: number;
  title: string;
  chapterId?: string | null;
  audioBytes: Buffer;
}) {
  const { publicUrl } = await uploadAudioToR2(
    params.bookId,
    params.audioId,
    params.number,
    params.audioBytes
  );

  // ElevenLabs output_format=mp3_44100_128 → estimate duration from CBR size
  const bitrate = 128_000;
  const durationMs = Math.max(
    1000,
    Math.round((params.audioBytes.length * 8 * 1000) / bitrate)
  );

  await db.bookAudioTrack.upsert({
    where: {
      audioId_number: {
        audioId: params.audioId,
        number: params.number,
      },
    },
    create: {
      audioId: params.audioId,
      number: params.number,
      title: params.title,
      audioUrl: publicUrl,
      chapterId: params.chapterId ?? null,
      durationMs,
    },
    update: {
      title: params.title,
      audioUrl: publicUrl,
      chapterId: params.chapterId ?? null,
      durationMs,
    },
  });

  return publicUrl;
}

function ttsOptionsFromSettings(
  voiceId: string,
  settings: VoiceSettingsConfig
): TtsOptions {
  return {
    voiceId,
    modelId: settings.modelId,
    stability: settings.stability,
    similarityBoost: settings.similarityBoost,
    style: settings.style,
    speed: settings.speed,
    useSpeakerBoost: settings.useSpeakerBoost,
  };
}

async function runAudiobook(
  bookId: string,
  audioId: string,
  voiceId: string,
  userId: string,
  emit: AudioStreamEmitter,
  voiceSettings: VoiceSettingsConfig
) {
  const book = await db.book.findUniqueOrThrow({
    where: { id: bookId },
    include: {
      chapters: {
        orderBy: { number: "asc" },
        include: { sections: { orderBy: { number: "asc" } } },
      },
    },
  });

  const chapters = book.chapters.filter((c) =>
    c.sections.some((s) => s.content?.trim())
  );

  if (chapters.length === 0) {
    throw new Error("No chapter content available to narrate.");
  }

  const fullText = chapters.map((c) => chapterNarrationText(c)).join("\n\n");
  await assertAudioQuota(userId, estimateAudioMinutesFromText(fullText));

  emit({
    type: "phase",
    message: `Narrating ${chapters.length} chapters…`,
    audioType: "AUDIOBOOK",
  });

  const chapterBuffers: Buffer[] = [];

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const text = chapterNarrationText(chapter);
    if (!text.trim()) continue;

    emit({
      type: "phase",
      message: `Narrating chapter ${chapter.number}: ${chapter.title}`,
      audioType: "AUDIOBOOK",
    });

    const audioBytes = await textToSpeechLong(
      text,
      ttsOptionsFromSettings(voiceId, voiceSettings)
    );
    chapterBuffers.push(audioBytes);
    await creditAudioMinutes(userId, estimateAudioMinutesFromText(text));

    const audioUrl = await saveTrack({
      bookId,
      audioId,
      number: chapter.number,
      title: `Chapter ${chapter.number}: ${chapter.title}`,
      chapterId: chapter.id,
      audioBytes,
    });

    const progress = ((i + 1) / chapters.length) * 95;
    await db.bookAudio.update({
      where: { id: audioId },
      data: { progress, status: "GENERATING" },
    });

    emit({
      type: "track_done",
      trackNumber: chapter.number,
      trackTitle: chapter.title,
      audioUrl,
      audioType: "AUDIOBOOK",
    });
    emit({
      type: "progress",
      progress,
      status: "GENERATING",
      audioType: "AUDIOBOOK",
      trackNumber: chapter.number,
      trackTitle: chapter.title,
    });
  }

  if (chapterBuffers.length > 0) {
    emit({
      type: "phase",
      message: "Uploading full audiobook to storage…",
      audioType: "AUDIOBOOK",
    });

    const fullBytes = Buffer.concat(chapterBuffers);
    const { publicUrl: fullUrl } = await uploadFullAudioToR2(
      bookId,
      audioId,
      fullBytes,
      `${book.title.replace(/[^\w\s.-]+/g, "").trim() || "audiobook"}.mp3`
    );

    await db.bookAudio.update({
      where: { id: audioId },
      data: { audioUrl: fullUrl, progress: 100 },
    });
  }
}

type PodcastEpisode = {
  number: number;
  title: string;
  script: string;
};

async function buildPodcastEpisodes(book: {
  title: string;
  description: string | null;
  genre: string | null;
  tone: string | null;
  model: string;
  chapters: {
    number: number;
    title: string;
    summary: string | null;
    sections: { content: string | null }[];
  }[];
}): Promise<PodcastEpisode[]> {
  const chapterBriefs = book.chapters
    .slice(0, 12)
    .map((c) => {
      const excerpt =
        c.sections
          .map((s) => s.content ?? "")
          .join(" ")
          .slice(0, 400) ||
        c.summary ||
        "";
      return `Chapter ${c.number}: ${c.title}\n${excerpt}`;
    })
    .join("\n\n");

  const episodeCount = Math.min(Math.max(book.chapters.length, 3), 6);

  const raw = await createChatCompletion({
    model: book.model || "deepseek-r1",
    temperature: 0.7,
    json: true,
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content:
          "You write engaging podcast episode scripts based on books. Return JSON only.",
      },
      {
        role: "user",
        content: `Create a ${episodeCount}-episode podcast series about the book "${book.title}".
Genre: ${book.genre ?? "General"}. Tone: ${book.tone ?? "engaging"}.
Description: ${book.description ?? "n/a"}

Chapter material:
${chapterBriefs}

Return JSON:
{
  "episodes": [
    { "number": 1, "title": "...", "script": "Host monologue 400-700 words, spoken aloud, no stage directions" }
  ]
}`,
      },
    ],
  });

  const parsed = JSON.parse(extractJsonPayload(raw)) as {
    episodes?: PodcastEpisode[];
  };

  const episodes = (parsed.episodes ?? [])
    .filter((e) => e?.script?.trim())
    .map((e, i) => ({
      number: e.number || i + 1,
      title: e.title || `Episode ${i + 1}`,
      script: extractModelText(e.script).trim(),
    }));

  if (episodes.length === 0) {
    throw new Error("Failed to generate podcast scripts.");
  }

  return episodes;
}

async function runPodcast(
  bookId: string,
  audioId: string,
  voiceId: string,
  userId: string,
  emit: AudioStreamEmitter,
  voiceSettings: VoiceSettingsConfig
) {
  const book = await db.book.findUniqueOrThrow({
    where: { id: bookId },
    include: {
      chapters: {
        orderBy: { number: "asc" },
        include: { sections: { orderBy: { number: "asc" } } },
      },
    },
  });

  emit({
    type: "phase",
    message: "Writing podcast episode scripts…",
    audioType: "PODCAST",
  });

  const episodes = await buildPodcastEpisodes(book);
  const episodeBuffers: Buffer[] = [];
  const estimated = episodes.reduce(
    (sum, ep) => sum + estimateAudioMinutesFromText(ep.script),
    0
  );
  await assertAudioQuota(userId, estimated);

  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i];
    emit({
      type: "phase",
      message: `Recording episode ${ep.number}: ${ep.title}`,
      audioType: "PODCAST",
    });

    const audioBytes = await textToSpeechLong(
      ep.script,
      ttsOptionsFromSettings(voiceId, voiceSettings)
    );
    episodeBuffers.push(audioBytes);
    await creditAudioMinutes(userId, estimateAudioMinutesFromText(ep.script));

    const audioUrl = await saveTrack({
      bookId,
      audioId,
      number: ep.number,
      title: ep.title,
      audioBytes,
    });

    const progress = ((i + 1) / episodes.length) * 95;
    await db.bookAudio.update({
      where: { id: audioId },
      data: { progress, status: "GENERATING" },
    });

    emit({
      type: "track_done",
      trackNumber: ep.number,
      trackTitle: ep.title,
      audioUrl,
      audioType: "PODCAST",
    });
    emit({
      type: "progress",
      progress,
      status: "GENERATING",
      audioType: "PODCAST",
      trackNumber: ep.number,
      trackTitle: ep.title,
    });
  }

  if (episodeBuffers.length > 0) {
    emit({
      type: "phase",
      message: "Uploading full podcast to storage…",
      audioType: "PODCAST",
    });
    const { publicUrl: fullUrl } = await uploadFullAudioToR2(
      bookId,
      audioId,
      Buffer.concat(episodeBuffers),
      `${book.title.replace(/[^\w\s.-]+/g, "").trim() || "podcast"}.mp3`
    );
    await db.bookAudio.update({
      where: { id: audioId },
      data: { audioUrl: fullUrl, progress: 100 },
    });
  }
}

async function runMusic(
  bookId: string,
  audioId: string,
  userId: string,
  emit: AudioStreamEmitter
) {
  const book = await db.book.findUniqueOrThrow({ where: { id: bookId } });

  // Theme tracks count as ~1 minute of audio quota
  await assertAudioQuota(userId, 1);

  emit({
    type: "phase",
    message: "Composing theme music…",
    audioType: "MUSIC",
  });

  const prompt = [
    `Instrumental theme music for a book titled "${book.title}".`,
    book.genre ? `Genre mood: ${book.genre}.` : "",
    book.tone ? `Tone: ${book.tone}.` : "",
    book.description
      ? `Atmosphere inspired by: ${book.description.slice(0, 280)}.`
      : "",
    "Cinematic, polished, no vocals, suitable as an audiobook intro theme.",
  ]
    .filter(Boolean)
    .join(" ");

  const audioBytes = await generateMusic(prompt, 45_000);
  await creditAudioMinutes(userId, 1);

  const audioUrl = await saveTrack({
    bookId,
    audioId,
    number: 1,
    title: `${book.title} — Theme`,
    audioBytes,
  });

  const { publicUrl: fullUrl } = await uploadFullAudioToR2(
    bookId,
    audioId,
    audioBytes,
    `${book.title.replace(/[^\w\s.-]+/g, "").trim() || "theme"}.mp3`
  );

  await db.bookAudio.update({
    where: { id: audioId },
    data: {
      progress: 100,
      audioUrl: fullUrl,
      status: "GENERATING",
    },
  });

  emit({
    type: "track_done",
    trackNumber: 1,
    trackTitle: `${book.title} — Theme`,
    audioUrl,
    audioType: "MUSIC",
  });
  emit({
    type: "progress",
    progress: 100,
    status: "GENERATING",
    audioType: "MUSIC",
    trackNumber: 1,
    trackTitle: `${book.title} — Theme`,
  });
}

export async function runAudioGeneration(
  audioId: string,
  userId: string,
  emit?: AudioStreamEmitter
) {
  if (!isElevenLabsConfigured()) {
    throw new Error("ELEVENLABS_API_KEY is not configured.");
  }

  const audio = await db.bookAudio.findUniqueOrThrow({
    where: { id: audioId },
    include: { book: true },
  });

  if (audio.book.userId !== userId) {
    throw new Error("Unauthorized");
  }

  const emitter = emit ?? createAudioEventEmitter(audioId);
  const { voiceId, voiceName } = resolveVoice(audio.voiceId, audio.voiceName);
  const voiceSettings = parseStoredVoiceSettings(audio.voiceSettings);

  await db.bookAudio.update({
    where: { id: audioId },
    data: {
      status: "GENERATING",
      progress: 0,
      errorMessage: null,
      voiceId,
      voiceName,
      voiceSettings,
    },
  });

  emitter({
    type: "phase",
    message: `Starting ${audio.type.toLowerCase()} generation…`,
    audioType: audio.type,
  });

  try {
    // Only clear tracks when retrying the same failed/pending job — never wipe
    // a previous completed generation (regenerate creates a new BookAudio).
    if (audio.status !== "COMPLETED") {
      await db.bookAudioTrack.deleteMany({ where: { audioId } });
    }

    if (audio.type === "AUDIOBOOK") {
      await runAudiobook(
        audio.bookId,
        audioId,
        voiceId,
        userId,
        emitter,
        voiceSettings
      );
    } else if (audio.type === "PODCAST") {
      await runPodcast(
        audio.bookId,
        audioId,
        voiceId,
        userId,
        emitter,
        voiceSettings
      );
    } else {
      await runMusic(audio.bookId, audioId, userId, emitter);
    }

    await db.bookAudio.update({
      where: { id: audioId },
      data: {
        status: "COMPLETED",
        progress: 100,
        completedAt: new Date(),
        errorMessage: null,
      },
    });

    emitter({
      type: "done",
      audioType: audio.type,
      audioId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Audio generation failed";
    await db.bookAudio.update({
      where: { id: audioId },
      data: {
        status: "FAILED",
        errorMessage: message,
      },
    });
    emitter({ type: "error", message, audioType: audio.type });
    throw error;
  }
}

export async function ensureAudioRecord(params: {
  bookId: string;
  userId: string;
  type: AudioDerivativeType;
  voiceId?: string;
  voiceName?: string;
  voiceSettings?: Partial<VoiceSettingsConfig> | null;
  /** When true, reset a completed/failed job so it can run again. */
  regenerate?: boolean;
}) {
  const book = await db.book.findUniqueOrThrow({
    where: { id: params.bookId, userId: params.userId },
  });

  if (book.status !== "COMPLETED") {
    throw new Error("Finish generating the book before creating audio.");
  }

  if (!isElevenLabsConfigured()) {
    throw new Error("ELEVENLABS_API_KEY is not configured.");
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: params.userId },
  });
  const audioLimit =
    user.audioMinutesLimit ||
    PLANS[user.plan as keyof typeof PLANS]?.audioMinutesLimit ||
    0;
  if (audioLimit <= 0) {
    throw new Error(
      "Audiobook narration requires Pro ($20/mo) or Premium ($30/mo)."
    );
  }
  if (user.audioMinutesUsed >= audioLimit) {
    throw new Error(
      `You've used all ${formatAudioMinutes(audioLimit)} of audiobook time this month. Upgrade or wait for renewal.`
    );
  }

  const generating = await db.bookAudio.findFirst({
    where: {
      bookId: params.bookId,
      type: params.type,
      status: "GENERATING",
    },
    orderBy: { createdAt: "desc" },
  });
  if (generating) {
    return generating;
  }

  // Keep completed versions — regenerate creates a new record instead of replacing.
  if (!params.regenerate) {
    const completed = await db.bookAudio.findFirst({
      where: {
        bookId: params.bookId,
        type: params.type,
        status: "COMPLETED",
      },
      orderBy: { createdAt: "desc" },
    });
    if (completed) {
      return completed;
    }

    const failedOrPending = await db.bookAudio.findFirst({
      where: {
        bookId: params.bookId,
        type: params.type,
        status: { in: ["FAILED", "PENDING"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (failedOrPending) {
      const { voiceId, voiceName } = resolveVoice(
        params.voiceId,
        params.voiceName
      );
      const voiceSettings = normalizeVoiceSettings(params.voiceSettings);
      return db.bookAudio.update({
        where: { id: failedOrPending.id },
        data: {
          status: "PENDING",
          progress: 0,
          errorMessage: null,
          completedAt: null,
          audioUrl: null,
          voiceId,
          voiceName,
          voiceSettings,
        },
      });
    }
  }

  const titleSuffix =
    params.type === "AUDIOBOOK"
      ? "Audiobook"
      : params.type === "PODCAST"
        ? "Podcast"
        : "Theme music";

  const priorCount = await db.bookAudio.count({
    where: { bookId: params.bookId, type: params.type },
  });

  const { voiceId, voiceName } = resolveVoice(
    params.voiceId,
    params.voiceName
  );
  const voiceSettings = normalizeVoiceSettings(params.voiceSettings);

  const title =
    priorCount === 0
      ? `${book.title} — ${titleSuffix}`
      : `${book.title} — ${titleSuffix} (${priorCount + 1})`;

  return db.bookAudio.create({
    data: {
      bookId: params.bookId,
      type: params.type,
      status: "PENDING",
      progress: 0,
      title,
      voiceId,
      voiceName,
      voiceSettings,
    },
  });
}
