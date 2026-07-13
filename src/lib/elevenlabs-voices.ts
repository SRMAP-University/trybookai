import {
  DEFAULT_TTS_MODEL,
  DEFAULT_VOICE_ID,
  DEFAULT_VOICE_NAME,
} from "@/lib/elevenlabs";

export type ElevenLabsVoice = {
  id: string;
  name: string;
  gender: "female" | "male" | "neutral";
  style: string;
  description: string;
};

/** Curated ElevenLabs library voices for narration. */
export const ELEVENLABS_VOICES: ElevenLabsVoice[] = [
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    gender: "female",
    style: "Calm",
    description: "Clear, warm narrator — great default for fiction",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Bella",
    gender: "female",
    style: "Soft",
    description: "Soft and conversational",
  },
  {
    id: "XrExE9yKIg1WjnnlVkGX",
    name: "Matilda",
    gender: "female",
    style: "Warm",
    description: "Warm storytelling voice",
  },
  {
    id: "pFZP5JQG7iQjIQuC4Bku",
    name: "Lily",
    gender: "female",
    style: "British",
    description: "British, articulate narration",
  },
  {
    id: "LcfcDJNUP1GQjkzn1xUU",
    name: "Emily",
    gender: "female",
    style: "Calm",
    description: "Calm and meditative",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    gender: "male",
    style: "Deep",
    description: "Deep, authoritative narrator",
  },
  {
    id: "TxGEqnHWrfWFTfGW9XjX",
    name: "Josh",
    gender: "male",
    style: "Young",
    description: "Young and natural",
  },
  {
    id: "VR6AewLTigWG4xSOukaG",
    name: "Arnold",
    gender: "male",
    style: "Crisp",
    description: "Crisp, professional delivery",
  },
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "George",
    gender: "male",
    style: "British",
    description: "Warm British storyteller",
  },
  {
    id: "onwK4e9ZLuTAKqWW03F9",
    name: "Daniel",
    gender: "male",
    style: "Steady",
    description: "Steady documentary tone",
  },
  {
    id: "IKne3meq5aSn9XLyUdCD",
    name: "Charlie",
    gender: "male",
    style: "Casual",
    description: "Casual Australian tone",
  },
  {
    id: "N2lVS1w4EtoT3dr4eOWO",
    name: "Callum",
    gender: "male",
    style: "Intense",
    description: "Intense, dramatic reads",
  },
];

export const ELEVENLABS_TTS_MODELS = [
  {
    id: "eleven_multilingual_v2",
    name: "Multilingual v2",
    description: "Best quality / language balance for books",
  },
  {
    id: "eleven_turbo_v2_5",
    name: "Turbo v2.5",
    description: "Faster generation, slightly lower cost",
  },
  {
    id: "eleven_flash_v2_5",
    name: "Flash v2.5",
    description: "Fastest — good for drafts",
  },
] as const;

export type VoiceSettingsConfig = {
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
  useSpeakerBoost: boolean;
  modelId: string;
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettingsConfig = {
  stability: 0.45,
  similarityBoost: 0.75,
  style: 0.15,
  speed: 1,
  useSpeakerBoost: true,
  modelId: DEFAULT_TTS_MODEL,
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
    modelId:
      ELEVENLABS_TTS_MODELS.some((m) => m.id === base.modelId)
        ? base.modelId
        : DEFAULT_TTS_MODEL,
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
  });
}
