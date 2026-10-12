import { db } from "@/lib/db";
import { isReelGenerationActive } from "@/lib/reel-generator/background";
import {
  subscribeReelEvents,
  type ReelStreamEmitter,
} from "@/lib/reel-generator/events";

const POLL_MS = 1500;

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

const TERMINAL_SHOT = new Set(["DONE", "REUSED", "FAILED"]);

async function snapshot(reelId: string) {
  return db.storyReel.findUnique({
    where: { id: reelId },
    select: {
      status: true,
      progress: true,
      phase: true,
      errorMessage: true,
      episodes: {
        select: {
          number: true,
          shots: { select: { id: true, number: true, status: true, imageUrl: true } },
        },
      },
    },
  });
}

/**
 * Stream a reel's progress. Events from a job on this server arrive directly;
 * when the job runs on another server, the database is polled and new shots
 * are reported as they finish.
 */
export async function watchReelStream(
  reelId: string,
  emit: ReelStreamEmitter,
  signal?: AbortSignal,
  /** Stop before the function's time limit; the client reconnects and the job resumes. */
  maxMs = Infinity
) {
  const deadline = Date.now() + maxMs;
  const first = await snapshot(reelId);
  if (!first) {
    emit({ type: "error", message: "Reel not found" });
    return;
  }

  emit({ type: "progress", progress: first.progress, status: first.status });
  if (first.status === "COMPLETED") {
    emit({ type: "done", reelId });
    return;
  }
  if (first.status === "FAILED") {
    emit({ type: "error", message: first.errorMessage ?? "Reel generation failed" });
    return;
  }

  const seen = new Set(
    first.episodes.flatMap((e) => e.shots.filter((s) => TERMINAL_SHOT.has(s.status)).map((s) => s.id))
  );
  let finished = false;
  let lastPhase = first.phase;
  let lastProgress = first.progress;
  if (lastPhase) emit({ type: "phase", message: lastPhase });

  const unsubscribe = subscribeReelEvents(reelId, (event) => {
    if (event.type === "shot_done") seen.add(event.shotId);
    if (event.type === "phase") lastPhase = event.message;
    if (event.type === "done" || event.type === "error") finished = true;
    emit(event);
  });

  try {
    while (!signal?.aborted && !finished && Date.now() < deadline) {
      await sleep(POLL_MS, signal);
      if (finished || isReelGenerationActive(reelId)) continue;

      const latest = await snapshot(reelId);
      if (!latest) {
        emit({ type: "error", message: "Reel not found" });
        break;
      }
      for (const episode of latest.episodes) {
        for (const shot of episode.shots) {
          if (TERMINAL_SHOT.has(shot.status) && !seen.has(shot.id)) {
            seen.add(shot.id);
            emit({
              type: "shot_done",
              episodeNumber: episode.number,
              shotId: shot.id,
              shotNumber: shot.number,
              imageUrl: shot.imageUrl,
              status: shot.status,
            });
          }
        }
      }
      if (latest.phase && latest.phase !== lastPhase) {
        lastPhase = latest.phase;
        emit({ type: "phase", message: latest.phase });
      }
      if (latest.progress !== lastProgress) {
        lastProgress = latest.progress;
        emit({ type: "progress", progress: latest.progress, status: latest.status });
      }
      if (latest.status === "COMPLETED") {
        emit({ type: "done", reelId });
        break;
      }
      if (latest.status === "FAILED") {
        emit({ type: "error", message: latest.errorMessage ?? "Reel generation failed" });
        break;
      }
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
  } finally {
    unsubscribe();
  }
}
