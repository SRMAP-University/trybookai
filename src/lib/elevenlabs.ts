const ELEVEN_BASE = "https://api.elevenlabs.io/v1";

/** Default narrator — Rachel */
export const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
export const DEFAULT_VOICE_NAME = "Rachel";

/** Multilingual TTS; good quality / cost balance */
export const DEFAULT_TTS_MODEL = "eleven_multilingual_v2";

/** Soft character limit per TTS request (API allows more; keep chunks manageable). */
export const TTS_CHUNK_CHARS = 2500;

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

export async function textToSpeech(
  text: string,
  options: TtsOptions = {}
): Promise<Buffer> {
  const voiceId = options.voiceId || DEFAULT_VOICE_ID;
  const modelId = options.modelId || DEFAULT_TTS_MODEL;
  const url = `${ELEVEN_BASE}/text-to-speech/${voiceId}?output_format=mp3_44100_128`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": getApiKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: options.stability ?? 0.45,
        similarity_boost: options.similarityBoost ?? 0.75,
        style: options.style ?? 0.15,
        use_speaker_boost: options.useSpeakerBoost ?? true,
        speed: options.speed ?? 1,
      },
      ...(options.previousText
        ? { previous_text: options.previousText }
        : {}),
      ...(options.nextText ? { next_text: options.nextText } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `ElevenLabs TTS failed (${res.status}): ${body.slice(0, 400)}`
    );
  }

  return Buffer.from(await res.arrayBuffer());
}

/**
 * Split long text into sentence-aware chunks under `maxChars`.
 */
export function chunkTextForTts(
  text: string,
  maxChars = TTS_CHUNK_CHARS
): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const chunks: string[] = [];
  let remaining = cleaned;

  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf(". ", maxChars);
    if (splitAt < maxChars * 0.4) {
      splitAt = remaining.lastIndexOf(" ", maxChars);
    }
    if (splitAt < maxChars * 0.3) {
      splitAt = maxChars;
    } else {
      splitAt += 1; // include period / space
    }
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export async function textToSpeechLong(
  text: string,
  options: TtsOptions = {}
): Promise<Buffer> {
  const chunks = chunkTextForTts(text);
  if (chunks.length === 0) {
    throw new Error("No text to narrate");
  }

  const buffers: Buffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const audio = await textToSpeech(chunks[i], {
      ...options,
      previousText: i > 0 ? chunks[i - 1].slice(-200) : undefined,
      nextText:
        i < chunks.length - 1 ? chunks[i + 1].slice(0, 200) : undefined,
    });
    buffers.push(audio);
  }

  return Buffer.concat(buffers);
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
