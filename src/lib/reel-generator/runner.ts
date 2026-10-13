import { db } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";
import { parseMusicScore } from "@/lib/audio-generator/score-types";
import { parseStoredVoiceSettings } from "@/lib/elevenlabs-voices";
import { buildVisualBible, parseVisualBible } from "@/lib/reel-generator/cast";
import { buildEpisode, mapLimit } from "@/lib/reel-generator/episode";
import {
  createReelEventEmitter,
  type ReelStreamEmitter,
} from "@/lib/reel-generator/events";
import { buildReelScore } from "@/lib/reel-generator/music";
import { isFreeReelUser } from "@/lib/reel-generator/quota";
import { loadReelBook } from "@/lib/reel-generator/script";
import { normalizeMood } from "@/lib/reel-generator/types";

/** Episodes built at once. */
const EPISODE_CONCURRENCY = 2;

/** How often a running job proves it's alive. */
export const HEARTBEAT_MS = 15_000;

/** Images assumed per episode before its shot list exists (dynamic pacing draws about two dozen). */
const EXPECTED_SHOTS = 22;

/** Weighted progress: script 1, shot list 1, narration 2, each image 1. */
async function computeProgress(reelId: string): Promise<number> {
  const episodes = await db.reelEpisode.findMany({
    where: { reelId },
    select: {
      status: true,
      script: true,
      audioUrl: true,
      shots: { select: { status: true } },
    },
  });
  let done = 0;
  let total = 0;
  for (const ep of episodes) {
    const images = ep.shots.length || EXPECTED_SHOTS;
    total += 4 + images;
    if (ep.status === "COMPLETED") {
      done += 4 + images;
      continue;
    }
    if (ep.script) done += 1;
    if (ep.shots.length) done += 1;
    if (ep.audioUrl) done += 2;
    done += ep.shots.filter((s) => ["DONE", "REUSED", "FAILED"].includes(s.status)).length;
  }
  return total ? Math.min(99, (done / total) * 100) : 0;
}

/** Narration actually produced, in whole seconds; this is what the allowance is charged. */
async function narratedSeconds(reelId: string): Promise<number> {
  const episodes = await db.reelEpisode.findMany({
    where: { reelId, durationMs: { not: null } },
    select: { durationMs: true },
  });
  return episodes.reduce((sum, e) => sum + Math.ceil((e.durationMs ?? 0) / 1000), 0);
}

/**
 * Build every unfinished episode of a reel, then its music. Episodes fail
 * independently; the reel completes only when all of them do, and finished
 * episodes stay playable either way.
 */
export async function runReelGeneration(reelId: string, emit: ReelStreamEmitter) {
  const heartbeat = setInterval(() => {
    void db.storyReel
      .update({ where: { id: reelId }, data: { heartbeatAt: new Date() } })
      .catch(() => undefined);
  }, HEARTBEAT_MS);

  const send: ReelStreamEmitter = (event) => {
    emit(event);
    // Watchers on other servers read the phase from the database.
    if (event.type === "phase") {
      void db.storyReel
        .update({ where: { id: reelId }, data: { phase: event.message } })
        .catch(() => undefined);
    }
  };

  const onStep = async () => {
    const progress = await computeProgress(reelId);
    await db.storyReel.update({
      where: { id: reelId },
      data: { progress, heartbeatAt: new Date() },
    });
    emit({ type: "progress", progress, status: "GENERATING" });
  };

  try {
    const reel = await db.storyReel.findUniqueOrThrow({
      where: { id: reelId },
      include: {
        user: { select: { plan: true } },
        episodes: {
          orderBy: { number: "asc" },
          select: { id: true, number: true, status: true },
        },
      },
    });
    const book = await loadReelBook(reel.bookId);

    let bible = parseVisualBible(reel.visualBible);
    if (!bible) {
      send({ type: "phase", message: "Setting the look and cast…" });
      bible = await buildVisualBible(book, reel.stylePreset);
      await db.storyReel.update({ where: { id: reelId }, data: { visualBible: bible } });
    }

    const ctx = {
      reel: {
        id: reel.id,
        bookId: reel.bookId,
        format: reel.format,
        voiceId: reel.voiceId,
        voiceSettings: reel.voiceSettings,
      },
      book,
      bible,
      emit: send,
      onStep,
    };

    const failures: string[] = [];
    await mapLimit(
      reel.episodes.filter((e) => e.status !== "COMPLETED"),
      EPISODE_CONCURRENCY,
      async (episode) => {
        try {
          await buildEpisode(episode.id, ctx);
        } catch (error) {
          console.error(`[reels] episode ${episode.number} of ${reelId} failed:`, error);
          failures.push(error instanceof Error ? error.message : String(error));
          await db.reelEpisode
            .update({ where: { id: episode.id }, data: { status: "FAILED" } })
            .catch(() => undefined);
        }
      }
    );

    const episodes = await db.reelEpisode.findMany({
      where: { reelId },
      orderBy: { number: "asc" },
      select: {
        number: true,
        status: true,
        shots: {
          orderBy: { number: "asc" },
          select: { startMs: true, endMs: true, mood: true },
        },
      },
    });
    const completed = episodes.filter((e) => e.status === "COMPLETED");

    const settings = parseStoredVoiceSettings(reel.voiceSettings);
    const stored = (reel.voiceSettings ?? {}) as Record<string, unknown>;
    let voiceSettings = stored;
    if (settings.backgroundMusic !== "off" && completed.length > 0) {
      send({ type: "phase", message: "Scoring mood music…" });
      const score = await buildReelScore({
        bookId: reel.bookId,
        reelId,
        genre: book.genre,
        level: settings.backgroundMusic,
        maxNewCues: isFreeReelUser(reel.user) ? 1 : 3,
        knownCues: parseMusicScore(stored)?.cues,
        episodes: completed.map((e) => ({
          number: e.number,
          shots: e.shots.map((s) => ({ ...s, mood: normalizeMood(s.mood) })),
        })),
      });
      if (score) voiceSettings = { ...stored, music: score };
    }

    const allDone = completed.length === episodes.length;
    const failed = episodes.length - completed.length;
    await db.storyReel.update({
      where: { id: reelId },
      data: {
        status: allDone ? "COMPLETED" : "FAILED",
        progress: allDone ? 100 : await computeProgress(reelId),
        phase: null,
        billedSeconds: await narratedSeconds(reelId),
        voiceSettings: voiceSettings as object,
        completedAt: allDone ? new Date() : null,
        errorMessage: allDone
          ? null
          : `${failed} of ${episodes.length} ${episodes.length === 1 ? "video" : "videos"} failed${
              failures[0] ? `: ${failures[0]}` : ""
            }. Retry to finish ${failed === 1 ? "it" : "them"}.`,
      },
    });

    if (completed.length > 0) {
      await sendPushToUser(reel.userId, {
        title: allDone ? "Your Story Reel is ready" : "Part of your Story Reel is ready",
        body: `${reel.title} is ready to watch.`,
        data: { type: "reel_ready", reelId, bookId: reel.bookId },
      }).catch(() => undefined);
    }

    if (allDone) {
      emit({ type: "progress", progress: 100, status: "COMPLETED" });
      emit({ type: "done", reelId });
    } else {
      emit({ type: "error", message: failures[0] ?? "Some videos failed." });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reel generation failed";
    console.error(`[reels] ${reelId} failed:`, error);
    await db.storyReel
      .update({
        where: { id: reelId },
        data: {
          status: "FAILED",
          phase: null,
          errorMessage: message,
          billedSeconds: await narratedSeconds(reelId).catch(() => 0),
        },
      })
      .catch(() => undefined);
    emit({ type: "error", message });
  } finally {
    clearInterval(heartbeat);
  }
}

/**
 * Build one episode outside a full run. Entry point for the Cloudflare
 * workflow, which orchestrates long reels one episode per durable step.
 */
export async function buildEpisodeById(episodeId: string) {
  const { reel } = await db.reelEpisode.findUniqueOrThrow({
    where: { id: episodeId },
    select: {
      reel: {
        select: {
          id: true,
          bookId: true,
          format: true,
          voiceId: true,
          voiceSettings: true,
          stylePreset: true,
          visualBible: true,
        },
      },
    },
  });
  const book = await loadReelBook(reel.bookId);
  let bible = parseVisualBible(reel.visualBible);
  if (!bible) {
    bible = await buildVisualBible(book, reel.stylePreset);
    await db.storyReel.update({ where: { id: reel.id }, data: { visualBible: bible } });
  }
  await buildEpisode(episodeId, {
    reel: {
      id: reel.id,
      bookId: reel.bookId,
      format: reel.format,
      voiceId: reel.voiceId,
      voiceSettings: reel.voiceSettings,
    },
    book,
    bible,
    emit: createReelEventEmitter(reel.id),
  });
}
