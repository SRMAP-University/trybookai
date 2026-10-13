import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { parseMusicScore } from "@/lib/audio-generator/score-types";
import {
  normalizeMood,
  normalizeMotion,
  type ReelCaption,
  type ReelView,
} from "@/lib/reel-generator/types";

export const reelViewInclude = {
  episodes: {
    orderBy: { number: "asc" },
    include: { shots: { orderBy: { number: "asc" } } },
  },
} satisfies Prisma.StoryReelInclude;

export type ReelWithEpisodes = Prisma.StoryReelGetPayload<{
  include: typeof reelViewInclude;
}>;

function parseCaptions(value: unknown): ReelCaption[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (c): c is ReelCaption =>
      Array.isArray(c) &&
      typeof c[0] === "string" &&
      typeof c[1] === "number" &&
      typeof c[2] === "number"
  );
}

/** Settings stored on StoryReel.voiceSettings next to the TTS settings. */
export function reelTargetWords(voiceSettings: unknown, fallback: number): number {
  const value = Number((voiceSettings as { targetWords?: unknown } | null)?.targetWords);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Seconds of narration per picture, from the pacing chosen at creation. Older reels used 6. */
export function reelShotSeconds(voiceSettings: unknown): number {
  const value = Number((voiceSettings as { shotSeconds?: unknown } | null)?.shotSeconds);
  return Number.isFinite(value) && value >= 2 && value <= 12 ? value : 6;
}

export function toReelView(reel: ReelWithEpisodes): ReelView {
  return {
    id: reel.id,
    bookId: reel.bookId,
    title: reel.title,
    format: reel.format,
    status: reel.status,
    progress: reel.progress,
    phase: reel.phase,
    stylePreset: reel.stylePreset,
    voiceName: reel.voiceName,
    errorMessage: reel.errorMessage,
    shareToken: reel.shareToken,
    billedSeconds: reel.billedSeconds,
    createdAt: reel.createdAt.toISOString(),
    music: parseMusicScore(reel.voiceSettings),
    episodes: reel.episodes.map((episode) => ({
      id: episode.id,
      number: episode.number,
      title: episode.title,
      status: episode.status,
      audioUrl: episode.audioUrl,
      durationMs: episode.durationMs,
      captions: parseCaptions(episode.captions),
      videoStatus: episode.videoStatus,
      videoUrl: episode.videoUrl,
      shots: episode.shots.map((shot) => ({
        id: shot.id,
        number: shot.number,
        text: shot.text,
        description: shot.description,
        startMs: shot.startMs,
        endMs: shot.endMs,
        imageUrl: shot.imageUrl,
        previousImageUrl: shot.previousImageUrl,
        motion: normalizeMotion(shot.motion),
        mood: normalizeMood(shot.mood),
        status: shot.status,
        rerolls: shot.rerolls,
      })),
    })),
  };
}

export async function loadReelView(
  where: Prisma.StoryReelWhereUniqueInput
): Promise<ReelView | null> {
  const reel = await db.storyReel.findUnique({ where, include: reelViewInclude });
  return reel ? toReelView(reel) : null;
}

/** What a share link may show: finished videos only, no billing or errors. */
export function toPublicReelView(view: ReelView): ReelView {
  return {
    ...view,
    errorMessage: null,
    billedSeconds: 0,
    phase: null,
    shareToken: null,
    episodes: view.episodes.filter((e) => e.status === "COMPLETED"),
  };
}

/** The reel behind a share link, with the book it came from. */
export async function loadSharedReel(shareToken: string) {
  const reel = await db.storyReel.findUnique({
    where: { shareToken },
    include: {
      ...reelViewInclude,
      book: { select: { title: true, slug: true, isPublic: true, coverImage: true } },
    },
  });
  if (!reel || reel.deletedAt) return null;
  return { reel: toPublicReelView(toReelView(reel)), book: reel.book };
}
