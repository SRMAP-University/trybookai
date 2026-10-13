/**
 * Story Reels: shapes and presets shared by the generator, the API, the
 * players and the create flow. Client-safe: no server imports.
 */

import {
  SCORE_MOODS,
  type MusicScore,
  type ScoreMood,
} from "@/lib/audio-generator/score-types";

export type ReelFormat = "SHORTS" | "TRAILER" | "AUDIOBOOK";
export type ReelStatus = "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";

export const REEL_MOTIONS = [
  "push-in",
  "pull-out",
  "pan-left",
  "pan-right",
  "rise",
  "tilt-down",
  "drift",
  "punch-in",
] as const;
export type ReelMotion = (typeof REEL_MOTIONS)[number];

export const MOTION_LABELS: Record<ReelMotion, string> = {
  "push-in": "Push in",
  "pull-out": "Pull out",
  "pan-left": "Pan left",
  "pan-right": "Pan right",
  rise: "Rise",
  "tilt-down": "Tilt down",
  drift: "Drift",
  "punch-in": "Punch in",
};

export function normalizeMotion(value: unknown): ReelMotion {
  const motion = String(value ?? "").toLowerCase().trim();
  return (REEL_MOTIONS as readonly string[]).includes(motion)
    ? (motion as ReelMotion)
    : "push-in";
}

export function normalizeMood(value: unknown): ScoreMood {
  const mood = String(value ?? "").toLowerCase().trim();
  return (SCORE_MOODS as readonly string[]).includes(mood)
    ? (mood as ScoreMood)
    : "neutral";
}

export type ReelStyle = {
  id: string;
  label: string;
  /** Style line that opens every shot prompt. Names techniques, never artists. */
  prompt: string;
  /** CSS background for the picker swatch. */
  swatch: string;
};

export const REEL_STYLES: ReelStyle[] = [
  {
    id: "cinematic",
    label: "Cinematic",
    prompt:
      "cinematic digital painting, dramatic volumetric light, subtle film grain, rich color grading, highly detailed",
    swatch: "linear-gradient(160deg,#1d2b4f,#c27a3a)",
  },
  {
    id: "anime",
    label: "Anime",
    prompt:
      "anime key visual, clean line art, cel shading, vibrant color, detailed painted background",
    swatch: "linear-gradient(160deg,#ff9ab3,#5a6dff)",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    prompt:
      "soft watercolor illustration, visible paper texture, gentle washes of color, loose ink outlines",
    swatch: "linear-gradient(160deg,#cfe6dc,#e8b4a0)",
  },
  {
    id: "graphic-novel",
    label: "Graphic novel",
    prompt:
      "graphic novel panel art, bold ink lines, flat shadows, halftone texture, strong color blocks",
    swatch: "linear-gradient(160deg,#f5d547,#d1263b)",
  },
  {
    id: "noir",
    label: "Noir",
    prompt:
      "black and white film noir illustration, hard shadows, high contrast, moody atmosphere",
    swatch: "linear-gradient(160deg,#e9e9e9,#1b1b1b)",
  },
  {
    id: "storybook",
    label: "Storybook",
    prompt:
      "warm storybook illustration, gouache and colored pencil, soft rounded shapes, cozy palette",
    swatch: "linear-gradient(160deg,#ffe3a3,#6fae8a)",
  },
];

export const DEFAULT_REEL_STYLE = "cinematic";

export function reelStyle(id: string | null | undefined): ReelStyle {
  return REEL_STYLES.find((s) => s.id === id) ?? REEL_STYLES[0];
}

/** Narration pace used for estimates; matches the audiobook quota estimate. */
export const REEL_WORDS_PER_MINUTE = 150;

/** How often the picture changes. Dynamic cuts like a film edit, with close-ups and details. */
export const REEL_PACING = {
  dynamic: {
    label: "Dynamic",
    seconds: 3,
    description: "A new picture about every 3 s, with close-ups and details",
  },
  calm: {
    label: "Calm",
    seconds: 6,
    description: "A new picture about every 6 s, slower and quieter",
  },
} as const;
export type ReelPacing = keyof typeof REEL_PACING;
export const DEFAULT_PACING: ReelPacing = "dynamic";

/** Seconds of narration per picture at the default pacing. */
export const SHOT_SECONDS: number = REEL_PACING[DEFAULT_PACING].seconds;

/** Seconds per picture for a pacing value from a request or stored settings. */
export function pacingSeconds(value: unknown): number {
  return value === "calm" || value === "dynamic"
    ? REEL_PACING[value].seconds
    : SHOT_SECONDS;
}

/** Words per Short on paid plans (~75 s). */
export const SHORT_TARGET_WORDS = 190;
/** Words per Short on Free, sized to fit the 1-minute allowance (~54 s). */
export const FREE_SHORT_TARGET_WORDS = 135;
/** Words in a book trailer (~60 s). */
export const TRAILER_TARGET_WORDS = 150;

/** Re-rolls allowed per episode. */
export const MAX_REROLLS = { free: 3, paid: 20 } as const;

export function estimateReelSeconds(words: number): number {
  return Math.round((words / REEL_WORDS_PER_MINUTE) * 60);
}

export function formatReelSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m} min` : `${m} min ${rem} s`;
}

/** [word, startMs, endMs] */
export type ReelCaption = [string, number, number];

export type ReelShotView = {
  id: string;
  number: number;
  text: string;
  description: string;
  startMs: number | null;
  endMs: number | null;
  imageUrl: string | null;
  previousImageUrl: string | null;
  motion: ReelMotion;
  mood: ScoreMood;
  /** PENDING | GENERATING | DONE | REUSED | FAILED */
  status: string;
  rerolls: number;
};

export type ReelEpisodeView = {
  id: string;
  number: number;
  title: string;
  status: ReelStatus;
  audioUrl: string | null;
  durationMs: number | null;
  captions: ReelCaption[];
  videoStatus: string | null;
  videoUrl: string | null;
  shots: ReelShotView[];
};

export type ReelView = {
  id: string;
  bookId: string;
  title: string;
  format: ReelFormat;
  status: ReelStatus;
  progress: number;
  phase: string | null;
  stylePreset: string;
  voiceName: string | null;
  errorMessage: string | null;
  shareToken: string | null;
  billedSeconds: number;
  createdAt: string;
  music: MusicScore | null;
  episodes: ReelEpisodeView[];
};

/** One reel in the public feed, with the book it came from. */
export type ReelFeedItem = {
  /** Finished videos only, in order; at most the first few parts. */
  reel: ReelView;
  book: { title: string; slug: string; author: string };
  /** All finished parts, including ones not sent. */
  totalParts: number;
};

export type ReelFeedPage = { items: ReelFeedItem[]; nextCursor: string | null };

export type ReelAllowance = {
  limitSeconds: number;
  usedSeconds: number;
  remainingSeconds: number;
  /** Words per Short for this plan. */
  shortWords: number;
  canUseVisualAudiobook: boolean;
  maxRerolls: number;
  isFree: boolean;
};

export type ReelStreamEvent =
  | { type: "phase"; message: string }
  | { type: "progress"; progress: number; status: ReelStatus }
  | {
      type: "shot_done";
      episodeNumber: number;
      shotId: string;
      shotNumber: number;
      imageUrl: string | null;
      status: string;
    }
  | { type: "episode_done"; episodeNumber: number }
  | { type: "done"; reelId: string }
  | { type: "error"; message: string };

/** Index of the shot playing at `ms` (shots sorted by start). */
export function shotIndexAt(
  shots: { startMs: number | null }[],
  ms: number
): number {
  let lo = 0;
  let hi = shots.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = shots[mid].startMs ?? 0;
    if (start <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export type CaptionChunk = { start: number; end: number; first: number; last: number };

/**
 * Group caption words into on-screen chunks of two to four words, breaking
 * after punctuation, the way short-video captions read.
 */
export function captionChunks(captions: ReelCaption[]): CaptionChunk[] {
  const chunks: CaptionChunk[] = [];
  let first = 0;
  let chars = 0;
  for (let i = 0; i < captions.length; i++) {
    const word = captions[i][0];
    chars += word.length + 1;
    const count = i - first + 1;
    const breakHere =
      i === captions.length - 1 ||
      count >= 4 ||
      chars >= 22 ||
      (count >= 2 && /[,.!?;:…"”]$/.test(word)) ||
      /[.!?…]["”’)]*$/.test(word);
    if (breakHere) {
      chunks.push({
        start: captions[first][1],
        end: captions[i][2],
        first,
        last: i,
      });
      first = i + 1;
      chars = 0;
    }
  }
  return chunks;
}

/** Index of the caption chunk showing at `ms`, or -1 between chunks. */
export function chunkIndexAt(chunks: CaptionChunk[], ms: number): number {
  let lo = 0;
  let hi = chunks.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ms < chunks[mid].start) hi = mid - 1;
    else if (ms >= (chunks[mid + 1]?.start ?? Infinity)) lo = mid + 1;
    else return ms <= chunks[mid].end + 600 ? mid : -1;
  }
  return -1;
}
