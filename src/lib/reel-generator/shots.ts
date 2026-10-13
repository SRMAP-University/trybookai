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

/**
 * Sentences, with long ones also cut at commas, semicolons, colons and
 * dashes, so fast pacing has enough beats to change the picture on.
 */
export function splitBeats(script: string): Sentence[] {
  const beats: Sentence[] = [];
  for (const sentence of splitSentences(script)) {
    if (sentence.text.length < 70) {
      beats.push(sentence);
      continue;
    }
    const text = sentence.text;
    const breaks = /[,;:—–]\s+|\s+[—–]\s+/g;
    let pieceStart = 0;
    for (const match of text.matchAll(breaks)) {
      const cut = (match.index ?? 0) + match[0].length;
      if (cut - pieceStart >= 30 && text.length - cut >= 25) {
        beats.push({
          text: text.slice(pieceStart, cut).trim(),
          start: sentence.start + pieceStart,
          end: sentence.start + cut,
        });
        pieceStart = cut;
      }
    }
    beats.push({
      text: text.slice(pieceStart).trim(),
      start: sentence.start + pieceStart,
      end: sentence.end,
    });
  }
  return beats;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Group lines into shots of roughly `wordsPerShot` words when the planner fails. */
function fallbackStarts(lines: Sentence[], wordsPerShot: number): number[] {
  const starts = [0];
  let words = 0;
  lines.forEach((s, i) => {
    if (words >= wordsPerShot && i > 0) {
      starts.push(i);
      words = 0;
    }
    words += wordCount(s.text);
  });
  return starts;
}

/** Varied framing and camera moves for shots the planner didn't describe. */
const FALLBACK_MOTIONS: ReelMotion[] = ["push-in", "pan-left", "punch-in", "drift", "pull-out", "pan-right"];

function shotsFromStarts(
  script: string,
  lines: Sentence[],
  plan: Array<{
    start: number;
    description?: string;
    characters?: string[];
    motion?: ReelMotion;
    mood?: ScoreMood;
  }>
): PlannedShot[] {
  return plan.map((p, i) => {
    const charStart = i === 0 ? 0 : lines[p.start].start;
    const next = plan[i + 1];
    const charEnd = next ? lines[next.start].start : script.length;
    const text = script.slice(charStart, charEnd).trim();
    return {
      text,
      charStart,
      charEnd,
      description: p.description?.trim() || text,
      characters: p.characters ?? [],
      motion: p.motion ?? FALLBACK_MOTIONS[i % FALLBACK_MOTIONS.length],
      mood: p.mood ?? "neutral",
    };
  });
}

/**
 * Split a script into shots, each with one picture. Shot boundaries always
 * fall on line starts (sentences, or clauses at fast pacing), so every shot
 * maps to an exact character range of the script and so to exact timings.
 */
export async function planShots(
  script: string,
  context: { bible: VisualBible; narrative: boolean; title: string; shotSeconds?: number }
): Promise<PlannedShot[]> {
  const shotSeconds = context.shotSeconds ?? SHOT_SECONDS;
  const dense = shotSeconds <= 4;
  const lines = dense ? splitBeats(script) : splitSentences(script);
  if (lines.length === 0) return [];

  const seconds = estimateReelSeconds(wordCount(script));
  const target = Math.min(40, Math.max(3, Math.round(seconds / shotSeconds)));
  const wordsPerShot = Math.max(5, Math.round(wordCount(script) / target));
  const fallback = () =>
    shotsFromStarts(
      script,
      lines,
      fallbackStarts(lines, wordsPerShot).map((start) => ({ start }))
    );
  if (lines.length === 1) return fallback();

  const castNames = context.bible.cast.map((c) => c.name);
  const listing = lines.map((s, i) => `${i + 1}. ${s.text}`).join("\n");

  try {
    const raw = await createChatCompletion({
      model: OUTLINE_AI_MODEL,
      temperature: 0.45,
      max_tokens: 4000,
      json: true,
      messages: [
        {
          role: "system",
          content: `You are the storyboard artist and film editor for a narrated vertical video of "${context.title}". Split the numbered narration lines into shots. Each shot is one illustration shown while its lines are read.

Rules:
- About ${target} shots. Each covers ${dense ? "1 or 2" : "1 to 3"} consecutive lines; the first shot starts at line 1.
- Cut like a film editor so it never feels static: vary the framing from shot to shot. Mix wide establishing shots, medium shots, close-ups on faces and hands, detail inserts of important objects, over-the-shoulder and reaction shots. Never use the same framing three times in a row.
- Keep continuity: within a scene keep the same place, time of day, weather, lighting and each character's clothing and props. Change them only when the narration moves on.
- "description": what the picture shows, 45 words or fewer. Start with the framing, then subject, action, setting and lighting. Name the setting every time. Match exactly what the lines say; concrete and visual only.
${
  context.narrative
    ? `- "characters": names from this cast who are visible: ${castNames.length ? castNames.join(", ") : "none listed"}. Refer to them by name in the description.`
    : `- This book teaches or explains: show concrete scenes, objects, hands at work and visual metaphors for the idea. "characters" is [].`
}
- Show violence, injury or intimacy by implication (aftermath, shadows, reactions), never graphically.
- Never depict the likeness of a real, identifiable person.
- No text, signs, captions or letters in the picture.
- "motion": camera move over the image, one of ${REEL_MOTIONS.join(", ")}. Punch in on sudden moments, push in for tension, pull out for reveals, pans and drift for places and travel, rise or tilt-down for scale and awe. Vary it from shot to shot.
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
        description: String(s.description ?? "").replace(/\s+/g, " ").slice(0, 420),
        characters: Array.isArray(s.characters)
          ? s.characters
              .map((c) => String(c).trim())
              .filter((c) => castNames.some((n) => n.toLowerCase() === c.toLowerCase()))
          : [],
        motion: normalizeMotion(s.motion),
        mood: normalizeMood(s.mood),
      }))
      .filter((s) => Number.isFinite(s.start) && s.start >= 0 && s.start < lines.length)
      .sort((a, b) => a.start - b.start)
      .filter((s, i, list) => i === 0 || s.start !== list[i - 1].start);

    if (plan.length === 0) return fallback();
    plan[0].start = 0;
    return shotsFromStarts(script, lines, plan);
  } catch (error) {
    console.warn(
      "[reels] shot planning failed; splitting by length:",
      error instanceof Error ? error.message : error
    );
    return fallback();
  }
}
