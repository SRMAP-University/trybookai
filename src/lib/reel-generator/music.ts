import { db } from "@/lib/db";
import { composeCue, MOOD_FALLBACK } from "@/lib/audio-generator/score";
import {
  parseMusicScore,
  type MusicScore,
  type ScoreMood,
  type ScoreSpan,
} from "@/lib/audio-generator/score-types";
import { uploadMusicCueToR2 } from "@/lib/r2";

type ScoredEpisode = {
  number: number;
  shots: { startMs: number | null; endMs: number | null; mood: ScoreMood }[];
};

/** Cues the book's audiobook or podcast already has, reused at no cost. */
async function existingBookCues(bookId: string): Promise<MusicScore["cues"]> {
  const audios = await db.bookAudio.findMany({
    where: { bookId, status: "COMPLETED", type: { in: ["AUDIOBOOK", "PODCAST"] } },
    orderBy: { completedAt: "desc" },
    select: { voiceSettings: true },
  });
  const cues: MusicScore["cues"] = {};
  for (const audio of audios) {
    const score = parseMusicScore(audio.voiceSettings);
    for (const [mood, url] of Object.entries(score?.cues ?? {})) {
      if (url && !cues[mood as ScoreMood]) cues[mood as ScoreMood] = url;
    }
  }
  return cues;
}

/**
 * Mood music for a reel, in the same shape the audiobook player uses: one
 * looped cue per mood and per-episode spans built from the shot timings.
 * Reuses the book's existing cues first and composes at most `maxNewCues`.
 */
export async function buildReelScore(params: {
  bookId: string;
  reelId: string;
  genre: string | null;
  level: MusicScore["level"];
  maxNewCues: number;
  episodes: ScoredEpisode[];
  /** Cues this reel composed on an earlier run. */
  knownCues?: MusicScore["cues"];
}): Promise<MusicScore | null> {
  const weight = new Map<ScoreMood, number>();
  for (const episode of params.episodes) {
    for (const shot of episode.shots) {
      const ms = Math.max(0, (shot.endMs ?? 0) - (shot.startMs ?? 0));
      weight.set(shot.mood, (weight.get(shot.mood) ?? 0) + ms);
    }
  }
  const ranked = [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
  if (ranked.length === 0) return null;

  const cues = { ...(await existingBookCues(params.bookId)), ...params.knownCues };
  const composedBefore = Object.keys(params.knownCues ?? {}).length;
  const toCompose = ranked
    .filter((m) => !cues[m])
    .slice(0, Math.max(0, params.maxNewCues - composedBefore));
  await Promise.all(
    toCompose.map(async (mood) => {
      try {
        const bytes = await composeCue(mood, params.genre);
        cues[mood] = await uploadMusicCueToR2(params.bookId, params.reelId, mood, bytes);
      } catch (error) {
        console.warn(
          `[reels] ${mood} cue failed:`,
          error instanceof Error ? error.message : error
        );
      }
    })
  );

  const available = Object.keys(cues) as ScoreMood[];
  if (available.length === 0) return null;
  const covered = (mood: ScoreMood): ScoreMood =>
    cues[mood] ? mood : (MOOD_FALLBACK[mood].find((m) => cues[m]) ?? available[0]);

  const tracks: MusicScore["tracks"] = {};
  for (const episode of params.episodes) {
    const spans: ScoreSpan[] = [];
    for (const shot of episode.shots) {
      if (shot.startMs == null || shot.endMs == null) continue;
      const mood = covered(shot.mood);
      const last = spans[spans.length - 1];
      if (last && last[2] === mood) last[1] = shot.endMs;
      else spans.push([shot.startMs, shot.endMs, mood]);
    }
    tracks[String(episode.number)] = spans;
  }

  return { level: params.level, cues, tracks };
}
