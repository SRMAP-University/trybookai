/** ElevenLabs voice/model catalogue and settings. Client-safe: no API calls here. */

import { normalizeMusicLevel, type MusicLevel } from "@/lib/audio-generator/score-types";

export type ElevenLabsVoice = {
  id: string;
  name: string;
  gender: "female" | "male" | "neutral";
  style: string;
  description: string;
  accent?: string;
  age?: string;
  useCase?: string;
  /** Short sample clip hosted by ElevenLabs. */
  previewUrl?: string;
  category?: string;
};

/**
 * Last-resort narrator when the live voice list is unavailable. Voices come
 * from the account via GET /v2/voices; ElevenLabs retires its Default voices
 * on 31 Dec 2026, so nothing should depend on these IDs long term.
 */
export const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
export const DEFAULT_VOICE_NAME = "George";

/** Newest and most expressive model; recommended by ElevenLabs for audiobooks. */
export const DEFAULT_TTS_MODEL = "eleven_v4";

/** Most stable long-form model; used when a newer model isn't available. */
export const FALLBACK_TTS_MODEL = "eleven_multilingual_v2";

/** Shown only if the account's voice list can't be loaded. */
export const ELEVENLABS_VOICES: ElevenLabsVoice[] = [
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "male", style: "British", description: "Warm, captivating storyteller" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", gender: "male", style: "Deep", description: "Deep, resonant narrator" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", gender: "male", style: "British", description: "Steady, authoritative broadcaster" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", gender: "male", style: "Articulate", description: "Energetic, clear delivery" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", gender: "male", style: "Australian", description: "Relaxed, conversational" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", gender: "male", style: "Husky", description: "Intense, dramatic reads" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", gender: "female", style: "Soft", description: "Soft, reassuring narrator" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", gender: "female", style: "British", description: "Warm, velvety narration" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", gender: "female", style: "Warm", description: "Knowledgeable, friendly storyteller" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", gender: "female", style: "British", description: "Clear, engaging educator" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", gender: "female", style: "Upbeat", description: "Bright, quirky delivery" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", gender: "female", style: "Expressive", description: "Playful, bright and warm" },
];

export const ELEVENLABS_TTS_MODELS = [
  {
    id: "eleven_v4",
    name: "Eleven v4",
    description: "Newest and most expressive — best for audiobooks",
  },
  {
    id: "eleven_v3",
    name: "Eleven v3",
    description: "Dramatic, emotive delivery",
  },
  {
    id: "eleven_multilingual_v2",
    name: "Multilingual v2",
    description: "Most stable on very long narration",
  },
  {
    id: "eleven_flash_v2_5",
    name: "Flash v2.5",
    description: "Fastest and lowest cost — good for drafts",
  },
] as const;

/** Retired model ids stored on older audio settings → current equivalent. */
const RETIRED_TTS_MODELS: Record<string, string> = {
  eleven_turbo_v2_5: "eleven_flash_v2_5",
  eleven_turbo_v2: "eleven_flash_v2_5",
  eleven_flash_v2: "eleven_flash_v2_5",
  eleven_monolingual_v1: FALLBACK_TTS_MODEL,
  eleven_multilingual_v1: FALLBACK_TTS_MODEL,
};

export type VoiceSettingsConfig = {
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
  useSpeakerBoost: boolean;
  modelId: string;
  /** Mood-matched background music played under the narration. */
  backgroundMusic: MusicLevel;
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettingsConfig = {
  stability: 0.45,
  similarityBoost: 0.75,
  style: 0.15,
  speed: 1,
  useSpeakerBoost: true,
  modelId: DEFAULT_TTS_MODEL,
  backgroundMusic: "off",
};

export const VOICE_SETTING_PRESETS: {
  id: string;
  name: string;
  description: string;
  settings: Partial<VoiceSettingsConfig>;
}[] = [
  {
    id: "narration",
    name: "Audiobook",
    description: "Steady, clear chapter narration",
    settings: {
      stability: 0.55,
      similarityBoost: 0.75,
      style: 0.1,
      speed: 1,
    },
  },
  {
    id: "expressive",
    name: "Expressive",
    description: "More emotion and character",
    settings: {
      stability: 0.35,
      similarityBoost: 0.7,
      style: 0.35,
      speed: 1,
    },
  },
  {
    id: "documentary",
    name: "Documentary",
    description: "Calm and consistent",
    settings: {
      stability: 0.7,
      similarityBoost: 0.8,
      style: 0,
      speed: 0.95,
    },
  },
  {
    id: "podcast",
    name: "Podcast",
    description: "Conversational pacing",
    settings: {
      stability: 0.45,
      similarityBoost: 0.75,
      style: 0.2,
      speed: 1.05,
    },
  },
];

export function resolveVoice(
  voiceId?: string | null,
  voiceName?: string | null
) {
  const match = ELEVENLABS_VOICES.find((v) => v.id === voiceId);
  return {
    voiceId: voiceId || DEFAULT_VOICE_ID,
    voiceName: voiceName || match?.name || DEFAULT_VOICE_NAME,
  };
}

export function normalizeTtsModel(modelId?: string | null): string {
  const id = modelId ? (RETIRED_TTS_MODELS[modelId] ?? modelId) : DEFAULT_TTS_MODEL;
  return ELEVENLABS_TTS_MODELS.some((m) => m.id === id) ? id : DEFAULT_TTS_MODEL;
}

export function normalizeVoiceSettings(
  input?: Partial<VoiceSettingsConfig> | null
): VoiceSettingsConfig {
  const base = { ...DEFAULT_VOICE_SETTINGS, ...input };
  return {
    stability: clamp(base.stability, 0, 1),
    similarityBoost: clamp(base.similarityBoost, 0, 1),
    style: clamp(base.style, 0, 1),
    speed: clamp(base.speed, 0.7, 1.2),
    useSpeakerBoost: Boolean(base.useSpeakerBoost),
    modelId: normalizeTtsModel(base.modelId),
    backgroundMusic: normalizeMusicLevel(base.backgroundMusic),
  };
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function parseStoredVoiceSettings(
  value: unknown
): VoiceSettingsConfig {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
  const raw = value as Record<string, unknown>;
  return normalizeVoiceSettings({
    stability: Number(raw.stability),
    similarityBoost: Number(raw.similarityBoost ?? raw.similarity_boost),
    style: Number(raw.style),
    speed: Number(raw.speed),
    useSpeakerBoost: Boolean(
      raw.useSpeakerBoost ?? raw.use_speaker_boost ?? true
    ),
    modelId: typeof raw.modelId === "string" ? raw.modelId : undefined,
    backgroundMusic: normalizeMusicLevel(raw.backgroundMusic),
  });
}
