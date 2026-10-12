import { db } from "@/lib/db";
import { isNarrativeBook } from "@/lib/book-generator/core/format";
import { parseStoredVoiceSettings } from "@/lib/elevenlabs-voices";
import { uploadReelFileToR2 } from "@/lib/r2";
import type { VisualBible } from "@/lib/reel-generator/cast";
import type { ReelStreamEmitter } from "@/lib/reel-generator/events";
import {
  buildSafeShotPrompt,
  buildShotPrompt,
  drawShotImage,
} from "@/lib/reel-generator/images";
import { narrateScript } from "@/lib/reel-generator/narration";
import { writeEpisodeScript, type ReelBook } from "@/lib/reel-generator/script";
import { planShots } from "@/lib/reel-generator/shots";
import { reelTargetWords } from "@/lib/reel-generator/timeline";
import {
  SHORT_TARGET_WORDS,
  TRAILER_TARGET_WORDS,
  normalizeMood,
  type ReelMotion,
} from "@/lib/reel-generator/types";

/** Images drawn at once per episode. */
const IMAGE_CONCURRENCY = 3;

/** A claim older than this belongs to a server that died. */
export const SHOT_CLAIM_TTL_MS = 3 * 60_000;

export type EpisodeContext = {
  reel: {
    id: string;
    bookId: string;
    format: "SHORTS" | "TRAILER" | "AUDIOBOOK";
    voiceId: string | null;
    voiceSettings: unknown;
  };
  book: ReelBook;
  bible: VisualBible;
  emit: ReelStreamEmitter;
  /** Called after each saved step so the runner can refresh progress and heartbeat. */
  onStep?: () => Promise<void>;
};

/** Run `fn` over items with at most `limit` in flight, keeping result order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index], index);
      }
    })
  );
  return results;
}

async function withRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function pad(value: number, width: number) {
  return String(value).padStart(width, "0");
}

function castNames(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

/** A different camera move for a shot that borrows its neighbour's image. */
function contrastMotion(motion: string): ReelMotion {
  switch (motion) {
    case "push-in":
      return "pull-out";
    case "pull-out":
      return "push-in";
    case "pan-left":
      return "pan-right";
    case "pan-right":
      return "pan-left";
    default:
      return "push-in";
  }
}

/** Take a shot for this server: pending, or claimed by a server that died. */
async function claimShot(shotId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - SHOT_CLAIM_TTL_MS);
  const { count } = await db.reelShot.updateMany({
    where: {
      id: shotId,
      OR: [
        { status: "PENDING" },
        { status: "GENERATING", claimedAt: { lt: staleBefore } },
        { status: "GENERATING", claimedAt: null },
      ],
    },
    data: { status: "GENERATING", claimedAt: new Date(), attempts: { increment: 1 } },
  });
  return count === 1;
}

/**
 * Build one episode end to end. Every step checks for its saved output first,
 * so calling this again after a crash only does the missing work.
 */
export async function buildEpisode(episodeId: string, ctx: EpisodeContext): Promise<void> {
  let episode = await db.reelEpisode.findUniqueOrThrow({
    where: { id: episodeId },
    include: { shots: { orderBy: { number: "asc" } } },
  });
  if (episode.status === "COMPLETED") return;
  await db.reelEpisode.update({ where: { id: episodeId }, data: { status: "GENERATING" } });

  const chapter = episode.chapterId
    ? (ctx.book.chapters.find((c) => c.id === episode.chapterId) ?? null)
    : null;
  const label = chapter ? `chapter ${chapter.number}` : "the trailer";

  // 1. Script
  let script = episode.script;
  if (!script) {
    ctx.emit({ type: "phase", message: `Writing the script for ${label}…` });
    const targetWords = reelTargetWords(
      ctx.reel.voiceSettings,
      ctx.reel.format === "TRAILER" ? TRAILER_TARGET_WORDS : SHORT_TARGET_WORDS
    );
    script = await withRetry(
      () => writeEpisodeScript({ book: ctx.book, chapter, targetWords }),
      2
    );
    await db.reelEpisode.update({ where: { id: episodeId }, data: { script } });
    await ctx.onStep?.();
  }

  // 2. Shot list
  if (episode.shots.length === 0) {
    ctx.emit({ type: "phase", message: `Planning shots for ${label}…` });
    const planned = await planShots(script, {
      bible: ctx.bible,
      narrative: isNarrativeBook(ctx.book),
      title: ctx.book.title,
    });
    await db.reelShot.createMany({
      data: planned.map((shot, i) => ({
        episodeId,
        number: i + 1,
        text: shot.text,
        charStart: shot.charStart,
        charEnd: shot.charEnd,
        description: shot.description,
        characters: shot.characters,
        motion: shot.motion,
        mood: shot.mood,
      })),
      skipDuplicates: true,
    });
    episode = await db.reelEpisode.findUniqueOrThrow({
      where: { id: episodeId },
      include: { shots: { orderBy: { number: "asc" } } },
    });
    await ctx.onStep?.();
  }

  // 3 + 4. Narration and images don't depend on each other.
  const current = episode;
  await Promise.all([
    current.audioUrl ? Promise.resolve() : narrateEpisode(current, script, label, ctx),
    drawPendingShots(current.number, episodeId, ctx),
  ]);

  // 5. Finish
  await finalizeEpisode(episodeId, current.number, ctx);
}

async function narrateEpisode(
  episode: { id: string; number: number },
  script: string,
  label: string,
  ctx: EpisodeContext
) {
  ctx.emit({ type: "phase", message: `Narrating ${label}…` });
  const settings = parseStoredVoiceSettings(ctx.reel.voiceSettings);
  const narrated = await narrateScript(script, {
    voiceId: ctx.reel.voiceId ?? undefined,
    modelId: settings.modelId,
    stability: settings.stability,
    similarityBoost: settings.similarityBoost,
    style: settings.style,
    speed: settings.speed,
    useSpeakerBoost: settings.useSpeakerBoost,
  });

  const audioUrl = await uploadReelFileToR2(
    ctx.reel.bookId,
    ctx.reel.id,
    `ep-${pad(episode.number, 3)}/narration-${Date.now().toString(36)}.mp3`,
    narrated.audio,
    "audio/mpeg"
  );

  const shots = await db.reelShot.findMany({
    where: { episodeId: episode.id },
    orderBy: { number: "asc" },
    select: { id: true, charStart: true },
  });
  const starts: number[] = [];
  shots.forEach((shot, i) => {
    const at = i === 0 ? 0 : narrated.timeAt(shot.charStart);
    starts.push(Math.max(at, starts[i - 1] ?? 0));
  });

  await db.$transaction([
    ...shots.map((shot, i) =>
      db.reelShot.update({
        where: { id: shot.id },
        data: { startMs: starts[i], endMs: starts[i + 1] ?? narrated.durationMs },
      })
    ),
    db.reelEpisode.update({
      where: { id: episode.id },
      data: { audioUrl, durationMs: narrated.durationMs, captions: narrated.captions },
    }),
  ]);
  await ctx.onStep?.();
}

async function drawPendingShots(
  episodeNumber: number,
  episodeId: string,
  ctx: EpisodeContext
) {
  const shots = await db.reelShot.findMany({
    where: { episodeId, status: { in: ["PENDING", "GENERATING"] } },
    orderBy: { number: "asc" },
  });
  if (shots.length) {
    ctx.emit({ type: "phase", message: `Illustrating ${shots.length} shots…` });
  }

  await mapLimit(shots, IMAGE_CONCURRENCY, async (shot) => {
    if (!(await claimShot(shot.id))) return;
    const input = {
      description: shot.description,
      characters: castNames(shot.characters),
      mood: normalizeMood(shot.mood),
    };
    const draw = (prompt: string) =>
      drawShotImage({
        bookId: ctx.reel.bookId,
        reelId: ctx.reel.id,
        episodeNumber,
        shotNumber: shot.number,
        prompt,
      });

    let prompt = buildShotPrompt(ctx.bible, input);
    let imageUrl: string | null = null;
    try {
      imageUrl = await draw(prompt);
    } catch (error) {
      console.warn(
        `[reels] shot ${episodeNumber}.${shot.number} failed; trying a gentler prompt:`,
        error instanceof Error ? error.message : error
      );
      prompt = buildSafeShotPrompt(ctx.bible, input);
      try {
        imageUrl = await draw(prompt);
      } catch (retryError) {
        console.warn(
          `[reels] shot ${episodeNumber}.${shot.number} failed again:`,
          retryError instanceof Error ? retryError.message : retryError
        );
      }
    }

    const status = imageUrl ? "DONE" : "FAILED";
    await db.reelShot.update({
      where: { id: shot.id },
      data: { status, imageUrl, prompt, claimedAt: null },
    });
    ctx.emit({
      type: "shot_done",
      episodeNumber,
      shotId: shot.id,
      shotNumber: shot.number,
      imageUrl,
      status,
    });
    await ctx.onStep?.();
  });
}

/**
 * Shots the model refused borrow the nearest drawn image with a different
 * camera move, so one bad shot never fails the episode.
 */
async function finalizeEpisode(episodeId: string, episodeNumber: number, ctx: EpisodeContext) {
  const episode = await db.reelEpisode.findUniqueOrThrow({
    where: { id: episodeId },
    include: { shots: { orderBy: { number: "asc" } } },
  });
  if (!episode.audioUrl) throw new Error("Narration is missing for this episode.");

  const shots = episode.shots;
  if (shots.some((s) => s.status === "GENERATING" || s.status === "PENDING")) {
    throw new Error("Some shots are still being drawn elsewhere. Try again shortly.");
  }
  if (!shots.some((s) => s.imageUrl)) {
    throw new Error("No illustrations could be drawn for this episode.");
  }

  const updates = shots.flatMap((shot, i) => {
    if (shot.imageUrl) return [];
    const donor =
      shots.slice(0, i).reverse().find((s) => s.imageUrl) ??
      shots.slice(i + 1).find((s) => s.imageUrl)!;
    return [
      db.reelShot.update({
        where: { id: shot.id },
        data: {
          imageUrl: donor.imageUrl,
          status: "REUSED",
          motion: contrastMotion(donor.motion),
        },
      }),
    ];
  });

  await db.$transaction([
    ...updates,
    db.reelEpisode.update({ where: { id: episodeId }, data: { status: "COMPLETED" } }),
  ]);
  ctx.emit({ type: "episode_done", episodeNumber });
}
