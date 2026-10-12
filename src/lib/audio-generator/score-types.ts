/**
 * Background-music score for audiobooks and podcasts. Stored on
 * BookAudio.voiceSettings.music and played live under the narration by the
 * web player. Client-safe: no server imports.
 */

export const SCORE_MOODS = [
  "suspense",
  "action",
  "dark",
  "mystery",
  "calm",
  "warm",
  "sad",
  "wonder",
  "triumph",
  "neutral",
] as const;

export type ScoreMood = (typeof SCORE_MOODS)[number];

export type MusicLevel = "off" | "subtle" | "cinematic";

export const MUSIC_LEVELS: { id: MusicLevel; label: string; description: string }[] = [
  { id: "off", label: "Off", description: "Voice only" },
  { id: "subtle", label: "Subtle", description: "Quiet mood music under the voice" },
  { id: "cinematic", label: "Cinematic", description: "Fuller score that follows each scene" },
];

/** A scene in a track: [startMs, endMs, mood]. */
export type ScoreSpan = [number, number, ScoreMood];

export type MusicScore = {
  level: Exclude<MusicLevel, "off">;
  /** Mood → instrumental cue URL (looped under the scene). */
  cues: Partial<Record<ScoreMood, string>>;
  /** Track number → scenes in that track, in order. */
  tracks: Record<string, ScoreSpan[]>;
};

/** Music gain relative to the narration for each level. */
export const MUSIC_LEVEL_GAIN: Record<MusicScore["level"], number> = {
  subtle: 0.12,
  cinematic: 0.22,
};

export function normalizeMusicLevel(value: unknown): MusicLevel {
  return value === "subtle" || value === "cinematic" ? value : "off";
}

/** Read the score from a BookAudio.voiceSettings JSON value, if it has one. */
export function parseMusicScore(voiceSettings: unknown): MusicScore | null {
  const music = (voiceSettings as { music?: unknown } | null)?.music as
    | Partial<MusicScore>
    | undefined;
  if (!music || typeof music !== "object") return null;
  const level = normalizeMusicLevel(music.level);
  if (level === "off" || !music.cues || !music.tracks) return null;
  return { level, cues: music.cues, tracks: music.tracks };
}

/** Mood of the scene playing at `ms` in a track. */
export function moodAt(spans: ScoreSpan[] | undefined, ms: number): ScoreMood | null {
  if (!spans?.length) return null;
  for (const [start, end, mood] of spans) {
    if (ms >= start && ms < end) return mood;
  }
  return null;
}
