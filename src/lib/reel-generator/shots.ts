import { OUTLINE_AI_MODEL } from "@/lib/ai-models";
import { createChatCompletion } from "@/lib/book-generator/llm";
import { parseJsonLoose } from "@/lib/book-generator/core/text";
import { SCORE_MOODS, type ScoreMood } from "@/lib/audio-generator/score-types";
import {
  REEL_MOTIONS,
  SHOT_SECONDS,
  estimateReelSeconds,
  normalizeMood,
  normalizeMotion,
  type ReelMotion,
} from "@/lib/reel-generator/types";
import type { VisualBible } from "@/lib/reel-generator/cast";

export type PlannedShot = {
  text: string;
  charStart: number;
  charEnd: number;
  description: string;
  characters: string[];
  motion: ReelMotion;
  mood: ScoreMood;
};

type Sentence = { text: string; start: number; end: number };

/** Sentences with their character offsets in the script; very short ones join the next. */
export function splitSentences(script: string): Sentence[] {
  const raw: Sentence[] = [];
  const pattern = /[^.!?…\n]+(?:[.!?…]+["”’)\]]*|(?=\n)|$)/g;
  for (const match of script.matchAll(pattern)) {
    const text = match[0];
    const lead = text.length - text.trimStart().length;
    const trimmed = text.trim();
    if (!trimmed) continue;
    const start = (match.index ?? 0) + lead;
    raw.push({ text: trimmed, start, end: start + trimmed.length });
  }

  const merged: Sentence[] = [];
  for (const sentence of raw) {
    const last = merged[merged.length - 1];
    if (last && last.text.length < 25) {
      last.text = script.slice(last.start, sentence.end);
      last.end = sentence.end;
    } else {
      merged.push({ ...sentence });
    }
  }
  return merged;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Group sentences into shots of roughly `wordsPerShot` words when the planner fails. */
function fallbackStarts(sentences: Sentence[], wordsPerShot: number): number[] {
  const starts = [0];
  let words = 0;
  sentences.forEach((s, i) => {
    if (words >= wordsPerShot && i > 0) {
      starts.push(i);
      words = 0;
    }
    words += wordCount(s.text);
  });
  return starts;
}

function shotsFromStarts(
  script: string,
  sentences: Sentence[],
  plan: Array<{
    start: number;
    description?: string;
    characters?: string[];
    motion?: ReelMotion;
    mood?: ScoreMood;
  }>
): PlannedShot[] {
  return plan.map((p, i) => {
    const charStart = i === 0 ? 0 : sentences[p.start].start;
    const next = plan[i + 1];
    const charEnd = next ? sentences[next.start].start : script.length;
    const text = script.slice(charStart, charEnd).trim();
    return {
      text,
      charStart,
      charEnd,
      description: p.description?.trim() || text,
      characters: p.characters ?? [],
      motion: p.motion ?? (i % 2 === 0 ? "push-in" : "pan-left"),
      mood: p.mood ?? "neutral",
    };
  });
}

/**
 * Split a script into shots, each one to three sentences with one picture.
 * Shot boundaries always fall on sentence starts, so every shot maps to an
 * exact character range of the script.
 */
export async function planShots(
  script: string,
  context: { bible: VisualBible; narrative: boolean; title: string }
): Promise<PlannedShot[]> {
  const sentences = splitSentences(script);
  if (sentences.length === 0) return [];

  const seconds = estimateReelSeconds(wordCount(script));
  const target = Math.min(20, Math.max(3, Math.round(seconds / SHOT_SECONDS)));
  const wordsPerShot = Math.max(8, Math.round(wordCount(script) / target));
  const fallback = () =>
    shotsFromStarts(
      script,
      sentences,
      fallbackStarts(sentences, wordsPerShot).map((start) => ({ start }))
    );
  if (sentences.length === 1) return fallback();

  const castNames = context.bible.cast.map((c) => c.name);
  const listing = sentences.map((s, i) => `${i + 1}. ${s.text}`).join("\n");

  try {
    const raw = await createChatCompletion({
      model: OUTLINE_AI_MODEL,
      temperature: 0.4,
      max_tokens: 2400,
      json: true,
      messages: [
        {
          role: "system",
          content: `You are the storyboard artist for a narrated vertical video of "${context.title}". Split the numbered narration sentences into shots. Each shot is one illustration shown while its sentences are read.

Rules:
- About ${target} shots. Each covers 1 to 3 consecutive sentences; the first shot starts at sentence 1.
- "description": what the picture shows, 40 words or fewer. Start with the framing (wide, medium or close-up), then subject, action, setting and lighting. Concrete and visual only.
${
  context.narrative
    ? `- "characters": names from this cast who are visible: ${castNames.length ? castNames.join(", ") : "none listed"}. Refer to them by name in the description.`
    : `- This book teaches or explains: show a concrete scene, object or visual metaphor for the idea. "characters" is [].`
}
- Show violence, injury or intimacy by implication (aftermath, shadows, reactions), never graphically.
- Never depict the likeness of a real, identifiable person.
- No text, signs, captions or letters in the picture.
- "motion": camera move over the image: ${REEL_MOTIONS.join(", ")}. Push in for tension, pull out for reveals, pans for landscapes and travel, rise for awe.
- "mood": one of ${SCORE_MOODS.join(", ")}.

Return only JSON: {"shots": [{"start": number, "description": string, "characters": [string], "motion": string, "mood": string}]}`,
        },
        { role: "user", content: listing },
      ],
    });

    const parsed = parseJsonLoose(raw) as {
      shots?: Array<{
        start?: unknown;
        description?: unknown;
        characters?: unknown;
        motion?: unknown;
        mood?: unknown;
      }>;
    };
    const plan = (parsed.shots ?? [])
      .map((s) => ({
        start: Math.round(Number(s.start)) - 1,
        description: String(s.description ?? "").replace(/\s+/g, " ").slice(0, 400),
        characters: Array.isArray(s.characters)
          ? s.characters
              .map((c) => String(c).trim())
              .filter((c) => castNames.some((n) => n.toLowerCase() === c.toLowerCase()))
          : [],
        motion: normalizeMotion(s.motion),
        mood: normalizeMood(s.mood),
      }))
      .filter((s) => Number.isFinite(s.start) && s.start >= 0 && s.start < sentences.length)
      .sort((a, b) => a.start - b.start)
      .filter((s, i, list) => i === 0 || s.start !== list[i - 1].start);

    if (plan.length === 0) return fallback();
    plan[0].start = 0;
    return shotsFromStarts(script, sentences, plan);
  } catch (error) {
    console.warn(
      "[reels] shot planning failed; splitting by length:",
      error instanceof Error ? error.message : error
    );
    return fallback();
  }
}
