import { db } from "@/lib/db";
import { parseVisualBible } from "@/lib/reel-generator/cast";
import { ReelError } from "@/lib/reel-generator/create";
import { buildShotPrompt, drawShotImage } from "@/lib/reel-generator/images";
import { maxRerollsFor } from "@/lib/reel-generator/quota";
import { reelStyle, normalizeMood, type ReelMotion } from "@/lib/reel-generator/types";

export type ShotEdit = {
  /** New picture description; redraws the image. */
  description?: string;
  /** New camera move only; no redraw. */
  motion?: ReelMotion;
  /** Redraw with the same description. */
  redraw?: boolean;
  /** Swap back to the image before the last re-roll. */
  undo?: boolean;
};

/**
 * Change one shot of a finished episode. Redraws take one image call and run
 * inside the request; the narration and timings never change.
 */
export async function editShot(params: {
  userId: string;
  reelId: string;
  shotId: string;
  edit: ShotEdit;
}) {
  const shot = await db.reelShot.findUnique({
    where: { id: params.shotId },
    include: {
      episode: {
        select: {
          id: true,
          number: true,
          status: true,
          videoStatus: true,
          reel: {
            select: {
              id: true,
              userId: true,
              bookId: true,
              stylePreset: true,
              visualBible: true,
              user: { select: { plan: true } },
            },
          },
        },
      },
    },
  });
  const reel = shot?.episode.reel;
  if (!shot || !reel || reel.id !== params.reelId || reel.userId !== params.userId) {
    throw new ReelError("Shot not found", 404);
  }
  if (shot.episode.status !== "COMPLETED") {
    throw new ReelError("Wait until this video finishes before editing its shots.", 409);
  }

  const { edit } = params;
  // An out-of-date MP4 is re-rendered on the next export.
  const staleVideo =
    shot.episode.videoStatus === "DONE"
      ? db.reelEpisode.update({ where: { id: shot.episode.id }, data: { videoStatus: "STALE" } })
      : null;

  if (edit.undo) {
    if (!shot.previousImageUrl) throw new ReelError("Nothing to undo.", 400);
    const [updated] = await db.$transaction([
      db.reelShot.update({
        where: { id: shot.id },
        data: { imageUrl: shot.previousImageUrl, previousImageUrl: shot.imageUrl, status: "DONE" },
      }),
      ...(staleVideo ? [staleVideo] : []),
    ]);
    return updated;
  }

  const description = edit.description?.trim().slice(0, 400);
  const redraw = Boolean(description) || edit.redraw;
  if (!redraw) {
    if (!edit.motion) throw new ReelError("Nothing to change.", 400);
    const [updated] = await db.$transaction([
      db.reelShot.update({ where: { id: shot.id }, data: { motion: edit.motion } }),
      ...(staleVideo ? [staleVideo] : []),
    ]);
    return updated;
  }

  const limit = maxRerollsFor(reel.user);
  const used = await db.reelShot.aggregate({
    where: { episodeId: shot.episode.id },
    _sum: { rerolls: true },
  });
  if ((used._sum.rerolls ?? 0) >= limit) {
    throw new ReelError(
      `You've used all ${limit} re-rolls for this video${limit < 20 ? ". Upgrade for more." : "."}`,
      402
    );
  }

  const bible = parseVisualBible(reel.visualBible) ?? {
    style: reelStyle(reel.stylePreset).prompt,
    cast: [],
    places: [],
  };
  const characters = Array.isArray(shot.characters) ? shot.characters.map(String) : [];
  const prompt = buildShotPrompt(bible, {
    description: description || shot.description,
    characters,
    mood: normalizeMood(shot.mood),
  });

  let imageUrl: string;
  try {
    imageUrl = await drawShotImage({
      bookId: reel.bookId,
      reelId: reel.id,
      episodeNumber: shot.episode.number,
      shotNumber: shot.number,
      prompt,
    });
  } catch (error) {
    console.warn("[reels] re-roll failed:", error instanceof Error ? error.message : error);
    throw new ReelError("The image model couldn't draw that. Try a different description.", 502);
  }

  const [updated] = await db.$transaction([
    db.reelShot.update({
      where: { id: shot.id },
      data: {
        imageUrl,
        previousImageUrl: shot.imageUrl,
        prompt,
        status: "DONE",
        rerolls: { increment: 1 },
        ...(description ? { description } : {}),
        ...(edit.motion ? { motion: edit.motion } : {}),
      },
    }),
    ...(staleVideo ? [staleVideo] : []),
  ]);
  return updated;
}
