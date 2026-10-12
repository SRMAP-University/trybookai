import { db } from "@/lib/db";
import { createReelEventEmitter } from "@/lib/reel-generator/events";
import { runReelGeneration } from "@/lib/reel-generator/runner";

const activeReelJobs = new Map<string, Promise<void>>();

/** A running job refreshes its heartbeat every 15 s; past this it's presumed dead. */
export const HEARTBEAT_STALE_MS = 60_000;

export function isReelGenerationActive(reelId: string) {
  return activeReelJobs.has(reelId);
}

export type EnsureReelResult = {
  started: boolean;
  alreadyRunning?: boolean;
  completed?: boolean;
  failed?: boolean;
  /** The job, so a route can keep its function alive with `after(() => task)`. */
  task?: Promise<void>;
};

/**
 * Start a reel's job on this server unless it's finished or another server is
 * running it. Ownership is taken with one conditional update, so two servers
 * can't both start the same reel.
 */
export async function ensureReelGenerationRunning(
  reelId: string,
  options: { retry?: boolean } = {}
): Promise<EnsureReelResult> {
  const local = activeReelJobs.get(reelId);
  if (local) return { started: false, alreadyRunning: true, task: local };

  const reel = await db.storyReel.findUnique({
    where: { id: reelId },
    select: { status: true },
  });
  if (!reel) throw new Error("Reel not found");
  if (reel.status === "COMPLETED") return { started: false, completed: true };
  if (reel.status === "FAILED" && !options.retry) return { started: false, failed: true };

  const staleBefore = new Date(Date.now() - HEARTBEAT_STALE_MS);
  const { count } = await db.storyReel.updateMany({
    where: {
      id: reelId,
      OR: [
        { status: { in: ["PENDING", "FAILED"] } },
        {
          status: "GENERATING",
          OR: [{ heartbeatAt: null }, { heartbeatAt: { lt: staleBefore } }],
        },
      ],
    },
    data: { status: "GENERATING", heartbeatAt: new Date(), errorMessage: null },
  });
  if (count === 0) return { started: false, alreadyRunning: true };

  // This server owns the reel now; shots still marked as drawing belong to a dead run.
  await db.reelShot.updateMany({
    where: { episode: { reelId }, status: "GENERATING" },
    data: { status: "PENDING", claimedAt: null },
  });
  if (options.retry) {
    await db.reelEpisode.updateMany({
      where: { reelId, status: "FAILED" },
      data: { status: "PENDING" },
    });
    await db.reelShot.updateMany({
      where: { episode: { reelId, status: { not: "COMPLETED" } }, status: "FAILED" },
      data: { status: "PENDING" },
    });
  }

  const task = runReelGeneration(reelId, createReelEventEmitter(reelId))
    .catch((error) => {
      console.error(`[reels] job for ${reelId} crashed:`, error);
    })
    .finally(() => {
      activeReelJobs.delete(reelId);
    });
  activeReelJobs.set(reelId, task);
  return { started: true, task };
}
