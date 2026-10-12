import {
  DEFAULT_TTS_MODEL,
  DEFAULT_VOICE_ID,
  DEFAULT_VOICE_NAME,
  ELEVENLABS_TTS_MODELS,
  ELEVENLABS_VOICES,
  FALLBACK_TTS_MODEL,
  type ElevenLabsVoice,
} from "@/lib/elevenlabs-voices";

export { DEFAULT_TTS_MODEL, DEFAULT_VOICE_ID, DEFAULT_VOICE_NAME };

const ELEVEN_BASE = "https://api.elevenlabs.io/v1";
const ELEVEN_BASE_V2 = "https://api.elevenlabs.io/v2";

/** Account voices and models change rarely; refresh hourly. */
const CATALOGUE_TTL_MS = 60 * 60 * 1000;

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Add it to your environment to generate audio."
    );
  }
  return key;
}

export function isElevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

export class ElevenLabsError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ElevenLabsError";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Catalogue: models and voices available to this account ────────────────

let modelCache: { at: number; ids: Set<string> } | null = null;

/** Model ids this account can use for text-to-speech (GET /v1/models). */
async function availableTtsModels(): Promise<Set<string> | null> {
  if (modelCache && Date.now() - modelCache.at < CATALOGUE_TTL_MS) {
    return modelCache.ids;
  }
  try {
    const res = await fetch(`${ELEVEN_BASE}/models`, {
      headers: { "xi-api-key": getApiKey() },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const models = (await res.json()) as Array<{
      model_id?: string;
      can_do_text_to_speech?: boolean;
    }>;
    const ids = new Set(
      models
        .filter((m) => m.model_id && m.can_do_text_to_speech !== false)
        .map((m) => m.model_id as string)
    );
    modelCache = { at: Date.now(), ids };
    return ids;
  } catch {
    return null;
  }
}

/** Our supported models, newest first, limited to what the account offers. */
export async function listTtsModels() {
  const available = await availableTtsModels();
  return available
    ? ELEVENLABS_TTS_MODELS.filter((m) => available.has(m.id))
    : [...ELEVENLABS_TTS_MODELS];
}

/** The requested model if the account has it, else the best one it does have. */
export async function resolveTtsModel(requested?: string | null): Promise<string> {
  const wanted = requested || DEFAULT_TTS_MODEL;
  const available = await availableTtsModels();
  if (!available || available.has(wanted)) return wanted;
  return ELEVENLABS_TTS_MODELS.find((m) => available.has(m.id))?.id ?? wanted;
}

type V2Voice = {
  voice_id: string;
  name?: string;
  category?: string;
  description?: string | null;
  preview_url?: string | null;
  labels?: Record<string, string> | null;
  is_legacy?: boolean;
};

let voiceCache: { at: number; voices: ElevenLabsVoice[] } | null = null;

function toVoice(v: V2Voice): ElevenLabsVoice {
  const labels = v.labels ?? {};
  const gender = (labels.gender ?? "").toLowerCase();
  const describe = labels.description ?? labels.descriptive ?? "";
  return {
    id: v.voice_id,
    name: v.name ?? "Voice",
    gender: gender === "male" || gender === "female" ? gender : "neutral",
    style: labels.accent ? capitalize(labels.accent) : capitalize(describe) || "Voice",
    description:
      v.description?.trim() ||
      [describe, labels.use_case].filter(Boolean).map(capitalize).join(" · ") ||
      capitalize(v.category ?? "voice"),
    accent: labels.accent,
    age: labels.age,
    useCase: labels.use_case,
    previewUrl: v.preview_url ?? undefined,
    category: v.category,
  };
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ") : "";
}

/**
 * Voices this account can narrate with (GET /v2/voices): defaults, saved
 * library voices and clones. Retired "legacy" voices are left out. Falls back
 * to the built-in list when the API can't be reached.
 */
export async function listVoices(): Promise<{
  voices: ElevenLabsVoice[];
  live: boolean;
}> {
  if (voiceCache && Date.now() - voiceCache.at < CATALOGUE_TTL_MS) {
    return { voices: voiceCache.voices, live: true };
  }
  try {
    const found: V2Voice[] = [];
    let token: string | null = null;
    for (let page = 0; page < 5; page++) {
      const params = new URLSearchParams({
        page_size: "100",
        include_total_count: "false",
        sort: "name",
        sort_direction: "asc",
      });
      if (token) params.set("next_page_token", token);
      const res = await fetch(`${ELEVEN_BASE_V2}/voices?${params}`, {
        headers: { "xi-api-key": getApiKey() },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new ElevenLabsError(`voices ${res.status}`, res.status);
      const data = (await res.json()) as {
        voices?: V2Voice[];
        has_more?: boolean;
        next_page_token?: string | null;
      };
      found.push(...(data.voices ?? []));
      token = data.has_more ? (data.next_page_token ?? null) : null;
      if (!token) break;
    }
    const current = found.filter((v) => !v.is_legacy);
    const voices = (current.length ? current : found).map(toVoice);
    if (!voices.length) return { voices: ELEVENLABS_VOICES, live: false };
    voiceCache = { at: Date.now(), voices };
    return { voices, live: true };
  } catch (error) {
    console.warn(
      "[elevenlabs] voice list unavailable; using built-in voices:",
      error instanceof Error ? error.message : error
    );
    return { voices: ELEVENLABS_VOICES, live: false };
  }
}

/** Best narrator among the account's voices: narration/audiobook voices first. */
export function pickNarrationVoice(voices: ElevenLabsVoice[]): ElevenLabsVoice {
  const score = (v: ElevenLabsVoice) => {
    const text = `${v.useCase ?? ""} ${v.description} ${v.style}`.toLowerCase();
    return (
      (/narrat|audiobook/.test(text) ? 4 : 0) +
      (/story|book/.test(text) ? 2 : 0) +
      (v.category === "premade" || v.category === "professional" ? 1 : 0) +
      (v.id === DEFAULT_VOICE_ID ? 1 : 0)
    );
  };
  return (
    [...voices].sort((a, b) => score(b) - score(a))[0] ?? {
      id: DEFAULT_VOICE_ID,
      name: DEFAULT_VOICE_NAME,
      gender: "male",
      style: "British",
      description: "Warm storyteller",
    }
  );
}

// ── Text to speech ─────────────────────────────────────────────────────────

export type TtsOptions = {
  voiceId?: string;
  modelId?: string;
  previousText?: string;
  nextText?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
  useSpeakerBoost?: boolean;
};

type ModelProfile = {
  /** Characters per request: big enough for flow, well under the model limit. */
  chunkChars: number;
  /** Accepts previous_text / next_text for continuity across chunks. */
  contextText: boolean;
  /** v3-generation models take stability as 0 (creative), 0.5 or 1 (robust). */
  discreteStability: boolean;
  /** Supports the style / speaker-boost / speed voice settings. */
  fullSettings: boolean;
};

function modelProfile(modelId: string): ModelProfile {
  if (/^eleven_v[34]/.test(modelId)) {
    return {
      chunkChars: modelId.startsWith("eleven_v4") ? 4500 : 3000,
      contextText: false,
      discreteStability: true,
      fullSettings: false,
    };
  }
  return { chunkChars: 4000, contextText: true, discreteStability: false, fullSettings: true };
}

function ttsRequestBody(text: string, options: TtsOptions, modelId: string): string {
  const profile = modelProfile(modelId);
  const stability = options.stability ?? 0.45;

  return JSON.stringify({
    text,
    model_id: modelId,
    voice_settings: profile.fullSettings
      ? {
          stability,
          similarity_boost: options.similarityBoost ?? 0.75,
          style: options.style ?? 0.15,
          use_speaker_boost: options.useSpeakerBoost ?? true,
          speed: options.speed ?? 1,
        }
      : {
          stability: profile.discreteStability ? Math.round(stability * 2) / 2 : stability,
          similarity_boost: options.similarityBoost ?? 0.75,
        },
    ...(profile.contextText && options.previousText
      ? { previous_text: options.previousText }
      : {}),
    ...(profile.contextText && options.nextText ? { next_text: options.nextText } : {}),
  });
}

/** POST to a TTS endpoint, retrying rate limits and transient server errors; fail fast on bad requests. */
async function postTts(url: string, body: string, accept: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": getApiKey(),
        "Content-Type": "application/json",
        Accept: accept,
      },
      body,
      signal: AbortSignal.timeout(180_000),
    });
    if (res.ok) return res;

    const detail = (await res.text()).slice(0, 400);
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 3) {
      throw new ElevenLabsError(`ElevenLabs TTS failed (${res.status}): ${detail}`, res.status);
    }
    const waitSeconds = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(waitSeconds) && waitSeconds > 0 ? waitSeconds * 1000 : 2000 * 2 ** attempt);
  }
}

export async function textToSpeech(
  text: string,
  options: TtsOptions = {}
): Promise<Buffer> {
  const voiceId = options.voiceId || DEFAULT_VOICE_ID;
  const modelId = options.modelId || DEFAULT_TTS_MODEL;
  const url = `${ELEVEN_BASE}/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const res = await postTts(url, ttsRequestBody(text, options, modelId), "audio/mpeg");
  return Buffer.from(await res.arrayBuffer());
}

/** When each character of the request text is spoken, in seconds. */
export type TtsAlignment = {
  characters: string[];
  starts: number[];
  ends: number[];
};

/**
 * Narrate one request's worth of text (under the model's chunk size) and get
 * per-character timings with it, for captions and cutting the audio into shots.
 * Uses the requested model when the account has it; if ElevenLabs rejects the
 * model, retries on the stable long-form model.
 */
export async function textToSpeechWithTimestamps(
  text: string,
  options: TtsOptions = {}
): Promise<{ audio: Buffer; alignment: TtsAlignment | null }> {
  const voiceId = options.voiceId || DEFAULT_VOICE_ID;
  const url = `${ELEVEN_BASE}/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`;

  const run = async (modelId: string) => {
    const res = await postTts(url, ttsRequestBody(text, options, modelId), "application/json");
    const data = (await res.json()) as {
      audio_base64?: string;
      alignment?: {
        characters?: string[];
        character_start_times_seconds?: number[];
        character_end_times_seconds?: number[];
      } | null;
    };
    if (!data.audio_base64) {
      throw new ElevenLabsError("ElevenLabs returned no audio", 502);
    }
    const a = data.alignment;
    const alignment =
      a?.characters?.length &&
      a.character_start_times_seconds?.length === a.characters.length &&
      a.character_end_times_seconds?.length === a.characters.length
        ? {
            characters: a.characters,
            starts: a.character_start_times_seconds,
            ends: a.character_end_times_seconds,
          }
        : null;
    return { audio: Buffer.from(data.audio_base64, "base64"), alignment };
  };

  const modelId = await resolveTtsModel(options.modelId);
  try {
    return await run(modelId);
  } catch (error) {
    const rejected =
      error instanceof ElevenLabsError && [400, 403, 404, 422].includes(error.status);
    if (!rejected || modelId === FALLBACK_TTS_MODEL) throw error;
    console.warn(
      `[elevenlabs] ${modelId} rejected the timestamped request; using ${FALLBACK_TTS_MODEL}:`,
      error.message
    );
    return run(FALLBACK_TTS_MODEL);
  }
}

/** Largest text one TTS request takes for this model. */
export async function ttsChunkChars(requestedModel?: string | null): Promise<number> {
  return modelProfile(await resolveTtsModel(requestedModel)).chunkChars;
}

function splitLongParagraph(paragraph: string, maxChars: number): string[] {
  const parts: string[] = [];
  let remaining = paragraph;
  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf(". ", maxChars);
    if (splitAt < maxChars * 0.4) splitAt = remaining.lastIndexOf(" ", maxChars);
    splitAt = splitAt < maxChars * 0.3 ? maxChars : splitAt + 1;
    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

/**
 * Split narration into chunks under `maxChars`, keeping paragraphs whole
 * where possible so pauses between paragraphs survive.
 */
export function chunkTextForTts(text: string, maxChars = 4000): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap((p) => splitLongParagraph(p, maxChars));

  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function narrateWithModel(text: string, options: TtsOptions, modelId: string) {
  const chunks = chunkTextForTts(text, modelProfile(modelId).chunkChars);
  if (chunks.length === 0) throw new Error("No text to narrate");
  const buffers: Buffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    buffers.push(
      await textToSpeech(chunks[i], {
        ...options,
        modelId,
        previousText: i > 0 ? chunks[i - 1].slice(-300) : undefined,
        nextText: i < chunks.length - 1 ? chunks[i + 1].slice(0, 300) : undefined,
      })
    );
  }
  return Buffer.concat(buffers);
}

/**
 * Narrate text of any length. Uses the requested model when the account has
 * it; if ElevenLabs rejects the model or its settings, retries on the stable
 * long-form model rather than failing the audiobook.
 */
export async function textToSpeechLong(
  text: string,
  options: TtsOptions = {}
): Promise<Buffer> {
  const modelId = await resolveTtsModel(options.modelId);
  try {
    return await narrateWithModel(text, options, modelId);
  } catch (error) {
    const rejected =
      error instanceof ElevenLabsError && [400, 403, 404, 422].includes(error.status);
    if (!rejected || modelId === FALLBACK_TTS_MODEL) throw error;
    console.warn(
      `[elevenlabs] ${modelId} rejected the request; narrating with ${FALLBACK_TTS_MODEL}:`,
      error.message
    );
    return narrateWithModel(text, options, FALLBACK_TTS_MODEL);
  }
}

export async function generateMusic(
  prompt: string,
  options: {
    musicLengthMs?: number;
    modelId?: string;
    forceInstrumental?: boolean;
  } = {}
): Promise<Buffer> {
  const musicLengthMs = Math.min(
    Math.max(options.musicLengthMs ?? 30_000, 3_000),
    600_000
  );
  const url = `${ELEVEN_BASE}/music`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": getApiKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      prompt,
      music_length_ms: musicLengthMs,
      model_id: options.modelId ?? "music_v2",
      ...(options.forceInstrumental != null
        ? { force_instrumental: options.forceInstrumental }
        : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `ElevenLabs music failed (${res.status}): ${body.slice(0, 400)}`
    );
  }

  return Buffer.from(await res.arrayBuffer());
}

/** Vocal song via composition plan when available, otherwise a lyrics-rich prompt. */
export async function generateSong(
  prompt: string,
  musicLengthMs = 90_000
): Promise<Buffer> {
  const length = Math.min(Math.max(musicLengthMs, 10_000), 180_000);
  const key = getApiKey();

  const planRes = await fetch(`${ELEVEN_BASE}/music/plan`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      music_length_ms: length,
      model_id: "music_v2",
    }),
  });

  if (planRes.ok) {
    const planJson = (await planRes.json()) as Record<string, unknown>;
    const compositionPlan =
      planJson.composition_plan && typeof planJson.composition_plan === "object"
        ? planJson.composition_plan
        : planJson;
    const composeRes = await fetch(`${ELEVEN_BASE}/music`, {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        composition_plan: compositionPlan,
        model_id: "music_v2",
      }),
    });
    if (composeRes.ok) {
      return Buffer.from(await composeRes.arrayBuffer());
    }
    const composeBody = await composeRes.text();
    console.warn(
      "[elevenlabs] song compose from plan failed",
      composeRes.status,
      composeBody.slice(0, 240)
    );
  } else {
    const planBody = await planRes.text();
    console.warn(
      "[elevenlabs] song plan failed",
      planRes.status,
      planBody.slice(0, 240)
    );
  }

  return generateMusic(prompt, {
    musicLengthMs: length,
    modelId: "music_v2",
    forceInstrumental: false,
  });
}
