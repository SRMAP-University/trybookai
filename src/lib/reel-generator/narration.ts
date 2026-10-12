import {
  chunkTextForTts,
  textToSpeechWithTimestamps,
  ttsChunkChars,
  type TtsOptions,
} from "@/lib/elevenlabs";
import type { ReelCaption } from "@/lib/reel-generator/types";

/** Duration of a CBR 128 kbps MP3 (ElevenLabs output) from its size. */
function mp3DurationMs(bytes: Buffer): number {
  return Math.round((bytes.length * 8 * 1000) / 128_000);
}

export type NarratedScript = {
  audio: Buffer;
  durationMs: number;
  captions: ReelCaption[];
  /** When the character at `index` of the script starts being spoken. */
  timeAt: (index: number) => number;
};

/**
 * Narrate a normalized script and time every character of it. Uses
 * ElevenLabs timestamps where it returns them; any chunk without them is
 * timed by spreading its length evenly over its audio.
 */
export async function narrateScript(
  script: string,
  tts: TtsOptions
): Promise<NarratedScript> {
  const maxChars = await ttsChunkChars(tts.modelId);
  const chunks = chunkTextForTts(script, maxChars);
  if (chunks.length === 0) throw new Error("No narration text.");

  const starts = new Array<number>(script.length).fill(Number.NaN);
  const ends = new Array<number>(script.length).fill(Number.NaN);
  const buffers: Buffer[] = [];
  let cursor = 0;
  let offsetMs = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const found = script.indexOf(chunk, cursor);
    const base = found >= 0 ? found : cursor;
    const { audio, alignment } = await textToSpeechWithTimestamps(chunk, {
      ...tts,
      previousText: i > 0 ? chunks[i - 1].slice(-300) : undefined,
      nextText: i < chunks.length - 1 ? chunks[i + 1].slice(0, 300) : undefined,
    });
    const ms = mp3DurationMs(audio);

    if (alignment && alignment.characters.length === chunk.length) {
      for (let c = 0; c < chunk.length && base + c < script.length; c++) {
        starts[base + c] = offsetMs + alignment.starts[c] * 1000;
        ends[base + c] = offsetMs + alignment.ends[c] * 1000;
      }
    } else {
      for (let c = 0; c < chunk.length && base + c < script.length; c++) {
        starts[base + c] = offsetMs + (c / chunk.length) * ms;
        ends[base + c] = offsetMs + ((c + 1) / chunk.length) * ms;
      }
    }

    buffers.push(audio);
    cursor = base + chunk.length;
    offsetMs += ms;
  }

  const durationMs = offsetMs;
  const timeAt = (index: number) => {
    for (let i = Math.max(0, index); i < starts.length; i++) {
      if (Number.isFinite(starts[i])) return Math.round(starts[i]);
    }
    return durationMs;
  };
  const endAt = (index: number) => {
    for (let i = Math.min(index, ends.length - 1); i >= 0; i--) {
      if (Number.isFinite(ends[i])) return Math.round(ends[i]);
    }
    return 0;
  };

  const captions: ReelCaption[] = [];
  for (const match of script.matchAll(/\S+/g)) {
    const start = match.index ?? 0;
    const end = start + match[0].length - 1;
    const startMs = timeAt(start);
    captions.push([match[0], startMs, Math.max(startMs, endAt(end))]);
  }

  return { audio: Buffer.concat(buffers), durationMs, captions, timeAt };
}
