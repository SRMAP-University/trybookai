import { db } from "@/lib/db";
import type { AudioDerivativeType } from "@/generated/prisma/client";
import {
  createChatCompletion,
  extractJsonPayload,
  extractModelText,
} from "@/lib/book-generator/llm";
import {
  generateMusic,
  generateSong,
  isElevenLabsConfigured,
  listVoices,
  pickNarrationVoice,
  textToSpeechLong,
  type TtsOptions,
} from "@/lib/elevenlabs";
import { isNarrativeBook } from "@/lib/book-generator/core/format";
import { markdownToNarration } from "@/lib/audio-generator/narration";
import {
  assignCueMoods,
  composeCue,
  emptyScore,
  scoreScenes,
  type Scene,
} from "@/lib/audio-generator/score";
import {
  parseMusicScore,
  type MusicScore,
  type ScoreMood,
  type ScoreSpan,
} from "@/lib/audio-generator/score-types";
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
import { SONG_STUDIO_GENRE } from "@/lib/song-studio";
import {
  uploadAudioToR2,
  uploadFullAudioToR2,
  uploadMusicCueToR2,
} from "@/lib/r2";
import {
  createAudioEventEmitter,
  type AudioStreamEmitter,
} from "@/lib/audio-generator/events";

/** Chapters narrated at once; each chapter's chunks stay sequential. */
const NARRATION_CONCURRENCY = 3;

/**
 * Spoken text for a chapter. Markdown becomes speech (headings, lists and
 * tables read naturally; figures dropped). Section titles are read only for
 * non-fiction, where they work like sub-headings; in a novel they're internal.
 */
function chapterNarrationText(
  chapter: {
    number: number;
    title: string;
    sections: { number: number; title: string; content: string | null }[];
  },
  options: { sectionTitles: boolean; opening?: string }
): string {
  const parts = [
    options.opening,
    `Chapter ${chapter.number}. ${chapter.title}.`,
  ].filter((p): p is string => Boolean(p));
  for (const section of chapter.sections) {
    const body = markdownToNarration(section.content);
    if (!body) continue;
    if (options.sectionTitles) parts.push(`${section.title.replace(/[.!?]*$/, "")}.`);
    parts.push(body);
  }
  return parts.join("\n\n");
}

/** Duration of a CBR 128 kbps MP3 (ElevenLabs output) from its size. */
function mp3DurationMs(bytes: Buffer): number {
  return Math.round((bytes.length * 8 * 1000) / 128_000);
}

/** Paragraphs for scene scoring; long unbroken scripts are split by sentences. */
function narrationParagraphs(text: string): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length >= 3 || text.length < 1500) return paragraphs;
  const sentences = text.match(/[^.!?]+[.!?]+["”’)]*\s*/g) ?? [text];
  const grouped: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current.length + sentence.length > 600 && current) {
      grouped.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) grouped.push(current.trim());
  return grouped;
}

/** Narrate scene by scene so each scene's start time in the track is exact. */
async function narrateScenes(
  scenes: Scene[],
  options: TtsOptions
): Promise<{ audio: Buffer; spans: ScoreSpan[] }> {
  const buffers: Buffer[] = [];
  const spans: ScoreSpan[] = [];
  let at = 0;
  for (const scene of scenes) {
    const bytes = await textToSpeechLong(scene.text, options);
    const ms = mp3DurationMs(bytes);
    spans.push([at, at + ms, scene.mood]);
    at += ms;
    buffers.push(bytes);
  }
  return { audio: Buffer.concat(buffers), spans };
}

/**
 * Collects the background-music score while narration runs and saves it on
 * BookAudio.voiceSettings.music. Saves are queued so an older snapshot never
 * overwrites a newer one.
 */
class ScoreBuilder {
  readonly score: MusicScore;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly ids: { bookId: string; audioId: string },
    private readonly settings: VoiceSettingsConfig,
    level: MusicScore["level"],
    /** Score saved by an earlier run of this job, to carry on from */
    saved?: MusicScore | null
  ) {
    this.score = saved && saved.level === level ? saved : emptyScore(level);
  }

  setTrack(number: number, spans: ScoreSpan[]) {
    this.score.tracks[String(number)] = spans;
    return this.save();
  }

  save() {
    this.queue = this.queue
      .then(() =>
        db.bookAudio.update({
          where: { id: this.ids.audioId },
          data: { voiceSettings: { ...this.settings, music: this.score } as object },
        })
      )
      .then(() => undefined)
      .catch((error) => {
        console.warn(
          "[score] saving music score failed:",
          error instanceof Error ? error.message : error
        );
      });
    return this.queue;
  }

  /** Compose cues for moods the tracks use but that a cut-short run never finished. */
  composeMissingCues(genre: string | null) {
    return this.composeCues(moodsWithoutCues(this.score), genre);
  }

  /** Compose and upload one cue per mood; a failed cue just leaves that mood silent. */
  async composeCues(moods: ScoreMood[], genre: string | null) {
    // A resumed job already has some cues; compose only the rest.
    const missing = moods.filter((mood) => !this.score.cues[mood]);
    await mapLimit(missing, 2, async (mood) => {
      try {
        const bytes = await composeCue(mood, genre);
        this.score.cues[mood] = await uploadMusicCueToR2(
          this.ids.bookId,
          this.ids.audioId,
          mood,
          bytes
        );
        await this.save();
      } catch (error) {
        console.warn(
          `[score] ${mood} cue failed:`,
          error instanceof Error ? error.message : error
        );
      }
    });
  }
}

/** Moods heard in the score's tracks that have no cue yet. */
function moodsWithoutCues(score: MusicScore): ScoreMood[] {
  const used = new Set<ScoreMood>();
  for (const spans of Object.values(score.tracks)) {
    for (const [, , mood] of spans) used.add(mood);
  }
  return [...used].filter((mood) => !score.cues[mood]);
}

/** Score scenes for every track and start composing their cues. */
async function prepareScore(
  builder: ScoreBuilder,
  texts: string[],
  context: { genre: string | null; title: string; kind: "audiobook" | "podcast" }
): Promise<{ scenes: Scene[][]; cuesReady: Promise<void> }> {
  const scored = await mapLimit(texts, 4, (text) =>
    scoreScenes(narrationParagraphs(text), context)
  );
  const { moods, scenes } = assignCueMoods(scored);
  return { scenes, cuesReady: builder.composeCues(moods, context.genre) };
}

/** Run `fn` over items with at most `limit` in flight, keeping result order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index], index);
      }
    })
  );
  return results;
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

/** Tracks already saved for this job (from earlier runs), by number. */
async function savedTracks(audioId: string): Promise<Map<number, string>> {
  const rows = await db.bookAudioTrack.findMany({
    where: { audioId },
    select: { number: true, audioUrl: true },
  });
  return new Map(rows.map((r) => [r.number, r.audioUrl]));
}

/** Bytes of a track saved by an earlier run, for joining the full file. */
async function fetchTrackBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Couldn't load a saved track (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Join every track in order (new ones from memory, earlier ones from storage) into one file. */
async function joinTracks(
  numbers: number[],
  fresh: Map<number, Buffer>,
  saved: Map<number, string>
): Promise<Buffer[]> {
  const buffers: Buffer[] = [];
  for (const number of numbers) {
    const bytes = fresh.get(number) ?? (saved.has(number) ? await fetchTrackBytes(saved.get(number)!) : null);
    if (bytes) buffers.push(bytes);
  }
  return buffers;
}

function fileTitle(title: string, fallback: string) {
  return `${title.replace(/[^\w\s.-]+/g, "").trim() || fallback}.mp3`;
}

/**
 * Narrate a book chapter by chapter. Resumable: chapters saved by an earlier
 * run are skipped (and not charged again), and once `deadline` passes no new
 * chapter starts; the job then returns "continue" to carry on in a new run.
 */
async function runAudiobook(
  bookId: string,
  audioId: string,
  voiceId: string,
  userId: string,
  emit: AudioStreamEmitter,
  voiceSettings: VoiceSettingsConfig,
  job: { deadline: number; storedSettings: unknown }
): Promise<RunOutcome> {
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

  const sectionTitles = !isNarrativeBook(book);
  const texts = chapters.map((chapter, i) =>
    chapterNarrationText(chapter, {
      sectionTitles,
      opening: i === 0 ? `${book.title}.` : undefined,
    })
  );
  const saved = await savedTracks(audioId);
  const todo = chapters
    .map((chapter, i) => ({ chapter, i }))
    .filter(({ chapter, i }) => texts[i].trim() && !saved.has(chapter.number));
  if (todo.length) {
    await assertAudioQuota(
      userId,
      estimateAudioMinutesFromText(todo.map(({ i }) => texts[i]).join("\n\n"))
    );
  }

  const builder =
    voiceSettings.backgroundMusic === "off"
      ? null
      : new ScoreBuilder(
          { bookId, audioId },
          voiceSettings,
          voiceSettings.backgroundMusic,
          parseMusicScore(job.storedSettings)
        );
  let score: Awaited<ReturnType<typeof prepareScore>> | null = null;
  if (builder && todo.length) {
    emit({
      type: "phase",
      message: "Scoring scenes for background music…",
      audioType: "AUDIOBOOK",
    });
    score = await prepareScore(
      builder,
      todo.map(({ i }) => texts[i]),
      { genre: book.genre, title: book.title, kind: "audiobook" }
    );
  }

  if (todo.length) {
    emit({
      type: "phase",
      message: saved.size
        ? `Narrating the remaining ${todo.length} of ${chapters.length} chapters…`
        : `Narrating ${chapters.length} chapters…`,
      audioType: "AUDIOBOOK",
    });
  }

  const fresh = new Map<number, Buffer>();
  let finished = saved.size;
  let deferred = false;
  await mapLimit(todo, NARRATION_CONCURRENCY, async ({ chapter, i }, k) => {
    // Out of time for this run: leave the rest for the next one.
    if (Date.now() > job.deadline) {
      deferred = true;
      return null;
    }
    const text = texts[i];

    emit({
      type: "phase",
      message: `Narrating chapter ${chapter.number}: ${chapter.title}`,
      audioType: "AUDIOBOOK",
    });

    const tts = ttsOptionsFromSettings(voiceId, voiceSettings);
    const narrated = score
      ? await narrateScenes(score.scenes[k], tts)
      : { audio: await textToSpeechLong(text, tts), spans: null };
    const audioBytes = narrated.audio;
    await creditAudioMinutes(userId, estimateAudioMinutesFromText(text));

    const audioUrl = await saveTrack({
      bookId,
      audioId,
      number: chapter.number,
      title: `Chapter ${chapter.number}: ${chapter.title}`,
      chapterId: chapter.id,
      audioBytes,
    });
    fresh.set(chapter.number, audioBytes);
    if (builder && narrated.spans) await builder.setTrack(chapter.number, narrated.spans);

    finished++;
    const progress = (finished / chapters.length) * 95;
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
    return null;
  });

  if (score) {
    emit({
      type: "phase",
      message: "Finishing background music…",
      audioType: "AUDIOBOOK",
    });
    await score.cuesReady;
  }
  if (builder) {
    await builder.composeMissingCues(book.genre);
    await builder.save();
  }

  if (deferred) return "continue";

  // Full audiobook in chapter order, whatever order or run the chapters finished in.
  const chapterBuffers = await joinTracks(
    chapters.map((c) => c.number),
    fresh,
    saved
  );
  if (chapterBuffers.length > 0) {
    emit({
      type: "phase",
      message: "Uploading full audiobook to storage…",
      audioType: "AUDIOBOOK",
    });

    const { publicUrl: fullUrl } = await uploadFullAudioToR2(
      bookId,
      audioId,
      Buffer.concat(chapterBuffers),
      fileTitle(book.title, "audiobook")
    );

    await db.bookAudio.update({
      where: { id: audioId },
      data: { audioUrl: fullUrl, progress: 100 },
    });
  }
  return "done";
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
    model: book.model || "llama-3.3",
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

/** Episode scripts saved on the job by an earlier run, so a resumed podcast stays the same series. */
function storedEpisodes(storedSettings: unknown): PodcastEpisode[] | null {
  const list = (storedSettings as { podcast?: unknown } | null)?.podcast;
  if (!Array.isArray(list) || list.length === 0) return null;
  const episodes = list.filter(
    (e): e is PodcastEpisode =>
      Boolean(e) && typeof e.number === "number" && typeof e.title === "string" && typeof e.script === "string"
  );
  return episodes.length ? episodes : null;
}

/** Record a podcast episode by episode; resumable like runAudiobook. */
async function runPodcast(
  bookId: string,
  audioId: string,
  voiceId: string,
  userId: string,
  emit: AudioStreamEmitter,
  voiceSettings: VoiceSettingsConfig,
  job: { deadline: number; storedSettings: unknown }
): Promise<RunOutcome> {
  const book = await db.book.findUniqueOrThrow({
    where: { id: bookId },
    include: {
      chapters: {
        orderBy: { number: "asc" },
        include: { sections: { orderBy: { number: "asc" } } },
      },
    },
  });

  let episodes = storedEpisodes(job.storedSettings);
  if (!episodes) {
    emit({
      type: "phase",
      message: "Writing podcast episode scripts…",
      audioType: "PODCAST",
    });
    episodes = await buildPodcastEpisodes(book);
  }
  // Keep the scripts on the job (the score builder writes the same object).
  const settingsWithScripts = { ...voiceSettings, podcast: episodes } as VoiceSettingsConfig;
  await db.bookAudio.update({
    where: { id: audioId },
    data: {
      voiceSettings: {
        ...settingsWithScripts,
        ...(parseMusicScore(job.storedSettings) ? { music: parseMusicScore(job.storedSettings) } : {}),
      } as object,
    },
  });

  const saved = await savedTracks(audioId);
  const todo = episodes
    .map((ep, i) => ({ ep, i }))
    .filter(({ ep }) => !saved.has(ep.number));
  if (todo.length) {
    await assertAudioQuota(
      userId,
      todo.reduce((sum, { ep }) => sum + estimateAudioMinutesFromText(ep.script), 0)
    );
  }

  const builder =
    voiceSettings.backgroundMusic === "off"
      ? null
      : new ScoreBuilder(
          { bookId, audioId },
          settingsWithScripts,
          voiceSettings.backgroundMusic,
          parseMusicScore(job.storedSettings)
        );
  const score =
    builder && todo.length
      ? await prepareScore(
          builder,
          todo.map(({ ep }) => ep.script),
          { genre: book.genre, title: book.title, kind: "podcast" }
        )
      : null;

  const fresh = new Map<number, Buffer>();
  let finished = saved.size;
  let deferred = false;
  for (let k = 0; k < todo.length; k++) {
    if (Date.now() > job.deadline) {
      deferred = true;
      break;
    }
    const { ep } = todo[k];
    emit({
      type: "phase",
      message: `Recording episode ${ep.number}: ${ep.title}`,
      audioType: "PODCAST",
    });

    const tts = ttsOptionsFromSettings(voiceId, voiceSettings);
    const narrated = score
      ? await narrateScenes(score.scenes[k], tts)
      : { audio: await textToSpeechLong(ep.script, tts), spans: null };
    const audioBytes = narrated.audio;
    if (builder && narrated.spans) await builder.setTrack(ep.number, narrated.spans);
    await creditAudioMinutes(userId, estimateAudioMinutesFromText(ep.script));

    const audioUrl = await saveTrack({
      bookId,
      audioId,
      number: ep.number,
      title: ep.title,
      audioBytes,
    });
    fresh.set(ep.number, audioBytes);

    finished++;
    const progress = (finished / episodes.length) * 95;
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

  if (score) await score.cuesReady;
  if (builder) {
    await builder.composeMissingCues(book.genre);
    await builder.save();
  }

  if (deferred) return "continue";

  const episodeBuffers = await joinTracks(
    episodes.map((ep) => ep.number),
    fresh,
    saved
  );
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
      fileTitle(book.title, "podcast")
    );
    await db.bookAudio.update({
      where: { id: audioId },
      data: { audioUrl: fullUrl, progress: 100 },
    });
  }
  return "done";
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

  const audioBytes = await generateMusic(prompt, {
    musicLengthMs: 45_000,
    forceInstrumental: true,
  });
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

async function buildSongPrompt(book: {
  title: string;
  description: string | null;
  genre: string | null;
  tone: string | null;
  model: string;
  chapters: { title: string; summary: string | null }[];
}): Promise<string> {
  const chapterHints = book.chapters
    .slice(0, 8)
    .map((c) => `${c.title}${c.summary ? `: ${c.summary.slice(0, 120)}` : ""}`)
    .join("; ");

  try {
    const raw = await createChatCompletion({
      model: book.model || "llama-3.3",
      temperature: 0.85,
      json: true,
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "You write prompts for ElevenLabs Music to generate original songs with sung vocals and lyrics. Return JSON only.",
        },
        {
          role: "user",
          content: `Write one Eleven Music prompt for a complete song inspired by the book "${book.title}".
Genre: ${book.genre ?? "storytelling"}. Tone: ${book.tone ?? "cinematic"}.
Description: ${book.description ?? "n/a"}
Chapters: ${chapterHints || "n/a"}

Return JSON: { "prompt": "..." }

The prompt must:
- Specify a vocal song (male or female lead singer), not instrumental-only
- Name genre, BPM range, and mood
- Include full lyrics for verse 1, chorus, verse 2, chorus, and a short outro
- Stay under 1800 characters
- Avoid copyrighted song titles or artist names`,
        },
      ],
    });
    const parsed = JSON.parse(extractJsonPayload(raw)) as { prompt?: string };
    const prompt = parsed.prompt?.trim();
    if (prompt && prompt.length > 40) return prompt.slice(0, 2000);
  } catch (error) {
    console.warn("[audio] song prompt LLM failed", error);
  }

  return [
    `An original vocal song inspired by the book "${book.title}".`,
    book.genre ? `Musical genre close to ${book.genre}.` : "Cinematic pop.",
    book.tone ? `Mood: ${book.tone}.` : "",
    book.description
      ? `Story: ${book.description.slice(0, 240)}.`
      : "",
    "Lead vocals, memorable chorus, verse-chorus structure, polished production, not instrumental.",
  ]
    .filter(Boolean)
    .join(" ");
}

function studioSongPrompt(book: {
  title: string;
  description: string | null;
  tone: string | null;
  customInstructions: string | null;
}): string {
  const style = book.customInstructions?.startsWith("song-studio:")
    ? book.customInstructions.slice("song-studio:".length).trim()
    : "";
  return [
    `An original vocal song titled "${book.title}".`,
    style ? `Musical style: ${style}.` : "",
    book.tone ? `Mood: ${book.tone}.` : "",
    book.description?.trim() ||
      "Write original lyrics with a verse and a memorable chorus.",
    "Lead vocals, verse-chorus structure, polished production, not instrumental.",
  ]
    .filter(Boolean)
    .join(" ");
}

async function runSong(
  bookId: string,
  audioId: string,
  userId: string,
  emit: AudioStreamEmitter
) {
  const book = await db.book.findUniqueOrThrow({
    where: { id: bookId },
    include: {
      chapters: {
        orderBy: { number: "asc" },
        select: { title: true, summary: true },
      },
    },
  });

  await assertAudioQuota(userId, 2);

  emit({
    type: "phase",
    message: "Writing lyrics…",
    audioType: "SONG",
  });

  const prompt =
    book.genre === SONG_STUDIO_GENRE ||
    book.customInstructions?.startsWith("song-studio:")
      ? studioSongPrompt(book)
      : await buildSongPrompt(book);

  emit({
    type: "phase",
    message: "Generating song with ElevenLabs…",
    audioType: "SONG",
  });

  const audioBytes = await generateSong(prompt, 90_000);
  await creditAudioMinutes(userId, 2);

  const trackTitle = `${book.title} — Song`;
  const audioUrl = await saveTrack({
    bookId,
    audioId,
    number: 1,
    title: trackTitle,
    audioBytes,
  });

  const { publicUrl: fullUrl } = await uploadFullAudioToR2(
    bookId,
    audioId,
    audioBytes,
    `${book.title.replace(/[^\w\s.-]+/g, "").trim() || "song"}.mp3`
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
    trackTitle,
    audioUrl,
    audioType: "SONG",
  });
  emit({
    type: "progress",
    progress: 100,
    status: "GENERATING",
    audioType: "SONG",
    trackNumber: 1,
    trackTitle,
  });
}

/** A run either finishes the job or stops early to carry on in a fresh run. */
export type RunOutcome = "done" | "continue";

/** Heartbeat interval; well under AUDIO_STALE_MS (background.ts). */
const HEARTBEAT_MS = 20_000;

/**
 * Stop starting new chapters after this, leaving room for chapters already in
 * flight and the final upload before Vercel's 5-minute function limit.
 */
const RUN_BUDGET_MS = process.env.VERCEL ? 150_000 : Number.POSITIVE_INFINITY;

/**
 * Run (or resume) one audio job. The caller must own the job (status
 * GENERATING, claimed in background.ts). Returns "continue" when the run
 * stopped early with work left; the job is then PENDING and resumes in a new
 * run, keeping every chapter already narrated.
 */
export async function runAudioGeneration(
  audioId: string,
  userId: string,
  emit?: AudioStreamEmitter
): Promise<RunOutcome> {
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
  const deadline = Date.now() + RUN_BUDGET_MS;

  // Keep progress and saved tracks: a resumed job carries on where it stopped.
  // (Raw voiceSettings also holds the music score and podcast scripts so far.)
  await db.bookAudio.update({
    where: { id: audioId },
    data: {
      status: "GENERATING",
      errorMessage: null,
      voiceId,
      voiceName,
    },
  });

  // Prove this job is alive, so nobody else takes it over.
  const heartbeat = setInterval(() => {
    void db.bookAudio
      .updateMany({ where: { id: audioId, status: "GENERATING" }, data: { status: "GENERATING" } })
      .catch(() => undefined);
  }, HEARTBEAT_MS);

  emitter({
    type: "phase",
    message: `Starting ${audio.type.toLowerCase()} generation…`,
    audioType: audio.type,
  });

  try {
    let outcome: RunOutcome = "done";
    const job = { deadline, storedSettings: audio.voiceSettings };
    if (audio.type === "AUDIOBOOK") {
      outcome = await runAudiobook(
        audio.bookId,
        audioId,
        voiceId,
        userId,
        emitter,
        voiceSettings,
        job
      );
    } else if (audio.type === "PODCAST") {
      outcome = await runPodcast(
        audio.bookId,
        audioId,
        voiceId,
        userId,
        emitter,
        voiceSettings,
        job
      );
    } else if (audio.type === "SONG") {
      await runSong(audio.bookId, audioId, userId, emitter);
    } else {
      await runMusic(audio.bookId, audioId, userId, emitter);
    }

    if (outcome === "continue") {
      // Hand the job back so the next run can claim it straight away.
      await db.bookAudio.update({
        where: { id: audioId },
        data: { status: "PENDING" },
      });
      emitter({
        type: "phase",
        message: "Still narrating… (continuing in the background)",
        audioType: audio.type,
      });
      return "continue";
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
    return "done";
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
  } finally {
    clearInterval(heartbeat);
  }
}

/**
 * Voice id + display name. With no choice, the best narration voice on the
 * account (ElevenLabs retires its fixed Default voices on 31 Dec 2026).
 */
async function resolveVoiceLive(voiceId?: string | null, voiceName?: string | null) {
  if (voiceId && voiceName) return { voiceId, voiceName };
  const { voices } = await listVoices();
  if (voiceId) {
    return resolveVoice(voiceId, voices.find((v) => v.id === voiceId)?.name ?? voiceName);
  }
  const narrator = pickNarrationVoice(voices);
  return { voiceId: narrator.id, voiceName: narrator.name };
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
      const { voiceId, voiceName } = await resolveVoiceLive(
        params.voiceId ?? failedOrPending.voiceId,
        params.voiceName ?? failedOrPending.voiceName
      );
      const voiceSettings = normalizeVoiceSettings(params.voiceSettings);
      // A retry keeps the chapters already narrated (with their music score
      // and podcast scripts), unless the voice changed: then start clean so one
      // book doesn't switch narrators halfway.
      const voiceChanged = Boolean(failedOrPending.voiceId && failedOrPending.voiceId !== voiceId);
      if (voiceChanged) {
        await db.bookAudioTrack.deleteMany({ where: { audioId: failedOrPending.id } });
      }
      const prior = (failedOrPending.voiceSettings ?? null) as Record<string, unknown> | null;
      const carried =
        !voiceChanged && prior
          ? {
              ...(prior.music ? { music: prior.music } : {}),
              ...(prior.podcast ? { podcast: prior.podcast } : {}),
            }
          : {};
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
          voiceSettings: { ...voiceSettings, ...carried } as object,
        },
      });
    }
  }

  const titleSuffix =
    params.type === "AUDIOBOOK"
      ? "Audiobook"
      : params.type === "PODCAST"
        ? "Podcast"
        : params.type === "SONG"
          ? "Song"
          : "Theme music";

  const priorCount = await db.bookAudio.count({
    where: { bookId: params.bookId, type: params.type },
  });

  const { voiceId, voiceName } = await resolveVoiceLive(
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
