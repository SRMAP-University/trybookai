/**
 * Builds the background-music score: the writer model splits narration into
 * scenes with one mood each, and one instrumental cue per mood is composed
 * with ElevenLabs Music and reused across the book.
 */

import { OUTLINE_AI_MODEL } from "@/lib/ai-models";
import { createChatCompletion } from "@/lib/book-generator/llm";
import { parseJsonLoose } from "@/lib/book-generator/core/text";
import { generateMusic } from "@/lib/elevenlabs";
import { SCORE_MOODS, type MusicScore, type ScoreMood } from "@/lib/audio-generator/score-types";

export type Scene = { text: string; mood: ScoreMood };

/** Shorter than this (~20 s of narration) a scene merges into its neighbour. */
const MIN_SCENE_CHARS = 320;

/** Distinct cues composed per book; rarer moods borrow the closest cue. */
const MAX_CUES = 6;

/** Cue length; looped under longer scenes. */
const CUE_MS = 75_000;

const MOOD_GUIDE: Record<ScoreMood, string> = {
  suspense: "tension builds, danger or uncertainty, something is about to happen",
  action: "chase, fight, urgent movement, high stakes in motion",
  dark: "dread, menace, grief-stricken darkness, horror",
  mystery: "curiosity, secrets, investigation, the unexplained",
  calm: "quiet, rest, reflection, peaceful setting",
  warm: "tenderness, friendship, romance, hope, comfort",
  sad: "loss, regret, sorrow, farewell",
  wonder: "awe, magic, discovery, vast landscapes",
  triumph: "victory, breakthrough, resolve, uplifting climax",
  neutral: "plain exposition or explanation with no strong emotion",
};

/** Closest substitutes when a mood doesn't get its own cue. */
export const MOOD_FALLBACK: Record<ScoreMood, ScoreMood[]> = {
  suspense: ["dark", "mystery", "action", "neutral"],
  action: ["suspense", "triumph", "dark", "neutral"],
  dark: ["suspense", "mystery", "sad", "neutral"],
  mystery: ["suspense", "wonder", "neutral", "calm"],
  calm: ["neutral", "warm", "wonder", "sad"],
  warm: ["calm", "triumph", "neutral", "wonder"],
  sad: ["calm", "dark", "warm", "neutral"],
  wonder: ["triumph", "mystery", "calm", "neutral"],
  triumph: ["wonder", "warm", "action", "neutral"],
  neutral: ["calm", "warm", "mystery", "wonder"],
};

const CUE_PROMPTS: Record<ScoreMood, string> = {
  suspense: "tense suspense underscore: low sustained strings, soft pulsing synth, sparse ticking percussion, slowly building tension",
  action: "driving action underscore: propulsive rhythmic strings and low percussion, urgent but steady energy",
  dark: "dark ominous underscore: deep drones, low brass swells, unsettling textures",
  mystery: "mysterious underscore: delicate plucked notes, airy pads, curious and enigmatic",
  calm: "calm ambient underscore: soft warm pads, gentle sparse piano, peaceful and still",
  warm: "warm tender underscore: soft strings and felt piano, hopeful and intimate",
  sad: "melancholic underscore: slow solo cello and soft piano, sorrowful and restrained",
  wonder: "wondrous underscore: shimmering strings, soft choir-like pads, sense of awe and discovery",
  triumph: "uplifting underscore: rising strings and gentle horns, hopeful resolve, restrained build",
  neutral: "neutral ambient underscore: soft evolving pads, minimal and unobtrusive, light focus",
};

function genreFlavor(genre: string | null | undefined): string {
  const g = (genre ?? "").toLowerCase();
  if (/sci|cyber|space|tech/.test(g)) return "modern cinematic synths";
  if (/fantasy|myth|epic/.test(g)) return "cinematic orchestral";
  if (/horror|thriller|crime|mystery/.test(g)) return "modern dark cinematic";
  if (/romance/.test(g)) return "intimate piano and strings";
  if (/child|young/.test(g)) return "light whimsical orchestral";
  if (/business|self|education|health|non-?fiction|technology|history|science|philosophy/.test(g)) {
    return "minimal modern ambient piano and pads";
  }
  return "cinematic";
}

/** Prompt for a loopable bed that sits under spoken narration. */
export function cuePrompt(mood: ScoreMood, genre: string | null | undefined): string {
  return `Instrumental background score for an audiobook, ${genreFlavor(genre)} style. ${CUE_PROMPTS[mood]}. Made to sit quietly under a narrator's voice: no vocals, no lead melody, no sudden hits or drops, steady dynamics, consistent texture from start to end so it can loop.`;
}

function defaultMood(genre: string | null | undefined, kind: "audiobook" | "podcast"): ScoreMood {
  if (kind === "podcast") return "neutral";
  return /business|self|education|health|non-?fiction|technology|science|philosophy/i.test(genre ?? "")
    ? "neutral"
    : "calm";
}

function normalizeMood(value: unknown): ScoreMood | null {
  const mood = String(value ?? "").toLowerCase().trim();
  return (SCORE_MOODS as readonly string[]).includes(mood) ? (mood as ScoreMood) : null;
}

/** Merge same-mood neighbours and scenes too short to deserve their own music. */
function tidyScenes(scenes: Scene[]): Scene[] {
  const merged: Scene[] = [];
  for (const scene of scenes) {
    const last = merged[merged.length - 1];
    if (last && (last.mood === scene.mood || scene.text.length < MIN_SCENE_CHARS)) {
      last.text = `${last.text}\n\n${scene.text}`;
    } else {
      merged.push({ ...scene });
    }
  }
  // A short opening scene (often just the chapter heading) joins the next one.
  if (merged.length > 1 && merged[0].text.length < MIN_SCENE_CHARS) {
    merged[1] = { text: `${merged[0].text}\n\n${merged[1].text}`, mood: merged[1].mood };
    merged.shift();
  }
  return merged;
}

/**
 * Split narration paragraphs into scenes, each with one mood. Falls back to a
 * single scene in the genre's default mood if the model's answer is unusable.
 */
export async function scoreScenes(
  paragraphs: string[],
  context: { genre: string | null; title: string; kind: "audiobook" | "podcast" }
): Promise<Scene[]> {
  const clean = paragraphs.map((p) => p.trim()).filter(Boolean);
  if (clean.length === 0) return [];
  const fallback = [{ text: clean.join("\n\n"), mood: defaultMood(context.genre, context.kind) }];
  if (clean.length === 1) return fallback;

  const listing = clean
    .map((p, i) => `${i + 1}. ${p.length > 260 ? `${p.slice(0, 260)}…` : p}`)
    .join("\n");

  try {
    const raw = await createChatCompletion({
      model: OUTLINE_AI_MODEL,
      temperature: 0.2,
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content: `You are the music supervisor for a ${context.kind} ("${context.title}", ${context.genre ?? "general"}). Split the numbered paragraphs into scenes whose emotional tone stays the same, and give each scene one mood for its background music.

Moods:
${SCORE_MOODS.map((m) => `- ${m}: ${MOOD_GUIDE[m]}`).join("\n")}

Rules:
- Scenes are contiguous and in order; the first scene starts at paragraph 1.
- Change mood only when the tone really shifts — a typical scene is 2–8 paragraphs (30 seconds to a few minutes of listening).
- Pick the mood the listener should feel, e.g. suspense as danger approaches, action once it hits, calm in the aftermath.

Return only JSON: {"scenes": [{"start": number, "mood": string}]}`,
        },
        { role: "user", content: listing },
      ],
    });

    const parsed = parseJsonLoose(raw) as { scenes?: Array<{ start?: unknown; mood?: unknown }> };
    const starts = (parsed.scenes ?? [])
      .map((s) => ({ start: Math.round(Number(s.start)), mood: normalizeMood(s.mood) }))
      .filter((s) => s.mood && Number.isFinite(s.start) && s.start >= 1 && s.start <= clean.length)
      .sort((a, b) => a.start - b.start)
      .filter((s, i, list) => i === 0 || s.start !== list[i - 1].start);
    if (starts.length === 0) return fallback;
    starts[0].start = 1;

    const scenes = starts.map((s, i) => ({
      text: clean.slice(s.start - 1, (starts[i + 1]?.start ?? clean.length + 1) - 1).join("\n\n"),
      mood: s.mood as ScoreMood,
    }));
    return tidyScenes(scenes);
  } catch (error) {
    console.warn(
      "[score] scene scoring failed; using one mood for the track:",
      error instanceof Error ? error.message : error
    );
    return fallback;
  }
}

/**
 * Choose the cues to compose (most-used moods, up to MAX_CUES) and remap
 * every scene to a mood that has a cue.
 */
export function assignCueMoods(sceneLists: Scene[][]): { moods: ScoreMood[]; scenes: Scene[][] } {
  const weight = new Map<ScoreMood, number>();
  for (const scene of sceneLists.flat()) {
    weight.set(scene.mood, (weight.get(scene.mood) ?? 0) + scene.text.length);
  }
  const moods = [...weight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CUES)
    .map(([mood]) => mood);
  const covered = (mood: ScoreMood): ScoreMood =>
    moods.includes(mood) ? mood : (MOOD_FALLBACK[mood].find((m) => moods.includes(m)) ?? moods[0]);
  return {
    moods,
    scenes: sceneLists.map((list) => tidyScenes(list.map((s) => ({ ...s, mood: covered(s.mood) })))),
  };
}

/** Compose one cue; tries the newest music model, then the previous one. */
export async function composeCue(mood: ScoreMood, genre: string | null): Promise<Buffer> {
  const prompt = cuePrompt(mood, genre);
  try {
    return await generateMusic(prompt, { musicLengthMs: CUE_MS, modelId: "music_v2_5", forceInstrumental: true });
  } catch (error) {
    console.warn(
      `[score] music_v2_5 failed for ${mood}; retrying with music_v2:`,
      error instanceof Error ? error.message : error
    );
    return generateMusic(prompt, { musicLengthMs: CUE_MS, modelId: "music_v2", forceInstrumental: true });
  }
}

export function emptyScore(level: MusicScore["level"]): MusicScore {
  return { level, cues: {}, tracks: {} };
}
