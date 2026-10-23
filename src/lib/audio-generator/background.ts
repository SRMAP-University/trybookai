import { db } from "@/lib/db";
import type { AudioDerivativeType } from "@/generated/prisma/client";
import { postInternal } from "@/lib/internal-call";
import {
  ensureAudioRecord,
  runAudioGeneration,
} from "@/lib/audio-generator/streaming";
import { createAudioEventEmitter } from "@/lib/audio-generator/events";
import type { VoiceSettingsConfig } from "@/lib/elevenlabs-voices";

const activeAudioJobs = new Map<string, Promise<void>>();

/**
 * A running job touches its row every 20 s (see runAudioGeneration); a
 * GENERATING row older than this belongs to a job that died and can be taken over.
 */
export const AUDIO_STALE_MS = 90_000;

/** Hand-offs in a row before giving up, so a broken job can't chain forever. */
const MAX_CHAIN = 80;

export function isAudioGenerationActive(audioId: string) {
  return activeAudioJobs.has(audioId);
}

type EnsureResult = {
  started: boolean;
  alreadyRunning: boolean;
  completed?: boolean;
  /** The job, so a route can keep its function alive with `after(() => task)`. */
  task?: Promise<void>;
};

/**
 * Take ownership of an audio job with one conditional update: a job nobody
 * is running (PENDING, optionally FAILED) or one whose runner went quiet.
 * Two servers can't both win, so a job never runs twice at once.
 */
async function claimAudioJob(audioId: string, allowFailed: boolean): Promise<boolean> {
  const staleBefore = new Date(Date.now() - AUDIO_STALE_MS);
  const { count } = await db.bookAudio.updateMany({
    where: {
      id: audioId,
      OR: [
        { status: "PENDING" },
        ...(allowFailed ? [{ status: "FAILED" as const }] : []),
        { status: "GENERATING", updatedAt: { lt: staleBefore } },
      ],
    },
    data: { status: "GENERATING", errorMessage: null },
  });
  return count > 0;
}

/** Carry on in a fresh function (Vercel) or shortly on this long-lived server. */
async function continueAudioJob(audioId: string, userId: string, chain: number) {
  if (chain > MAX_CHAIN) {
    await db.bookAudio.update({
      where: { id: audioId },
      data: { status: "FAILED", errorMessage: "Narration took too many attempts. Tap Retry to continue." },
    });
    return;
  }
  if (process.env.VERCEL) {
    const ok = await postInternal("/api/internal/audio", { audioId, userId, chain });
    if (!ok) console.warn(`[audio] hand-off for ${audioId} failed; it resumes when the book page is opened`);
  } else {
    setTimeout(() => {
      void ensureAudioGenerationById(audioId, userId, { chain }).catch((error) => {
        console.error(`[audio] resume of ${audioId} failed:`, error);
      });
    }, 1_000);
  }
}

function startAudioJob(audioId: string, userId: string, chain: number): Promise<void> {
  const emit = createAudioEventEmitter(audioId);
  const task = runAudioGeneration(audioId, userId, emit)
    .then(async (outcome) => {
      if (outcome === "continue") await continueAudioJob(audioId, userId, chain + 1);
    })
    .catch((error) => {
      console.error(`Audio generation failed for ${audioId}:`, error);
    })
    .finally(() => {
      activeAudioJobs.delete(audioId);
    });
  activeAudioJobs.set(audioId, task);
  return task;
}

export async function ensureAudioGenerationRunning(params: {
  bookId: string;
  userId: string;
  type: AudioDerivativeType;
  voiceId?: string;
  voiceName?: string;
  voiceSettings?: Partial<VoiceSettingsConfig> | null;
  regenerate?: boolean;
}) {
  const audio = await ensureAudioRecord(params);

  const existing = activeAudioJobs.get(audio.id);
  if (existing) {
    return { audio, started: false, alreadyRunning: true, task: existing };
  }

  if (audio.status === "COMPLETED") {
    return { audio, started: false, alreadyRunning: false, completed: true };
  }

  if (!(await claimAudioJob(audio.id, true))) {
    // Another server is narrating it right now.
    return { audio, started: false, alreadyRunning: true };
  }

  const task = startAudioJob(audio.id, params.userId, 0);
  return { audio, started: true, alreadyRunning: false, task };
}

/**
 * Make sure an existing audio job is running: resume it if it's waiting
 * (PENDING, e.g. between hand-offs) or if its runner died. Chapters already
 * narrated are kept.
 */
export async function ensureAudioGenerationById(
  audioId: string,
  userId: string,
  options: { chain?: number } = {}
): Promise<EnsureResult> {
  const existing = activeAudioJobs.get(audioId);
  if (existing) {
    return { started: false, alreadyRunning: true, task: existing };
  }

  const audio = await db.bookAudio.findUniqueOrThrow({
    where: { id: audioId },
    include: { book: true },
  });

  if (audio.book.userId !== userId) {
    throw new Error("Unauthorized");
  }

  if (audio.status === "COMPLETED") {
    return { started: false, alreadyRunning: false, completed: true };
  }
  if (audio.status === "FAILED") {
    // Failed jobs restart only when the user asks (Retry).
    return { started: false, alreadyRunning: false };
  }

  if (!(await claimAudioJob(audioId, false))) {
    return { started: false, alreadyRunning: true };
  }

  const task = startAudioJob(audioId, userId, options.chain ?? 0);
  return { started: true, alreadyRunning: false, task };
}

/**
 * Pick up audio jobs left waiting or abandoned (no heartbeat for a while),
 * each in its own function. Used by the daily sweep.
 */
export async function resumeStaleAudioJobs(limit = 20): Promise<number> {
  const staleBefore = new Date(Date.now() - 10 * 60_000);
  const stuck = await db.bookAudio.findMany({
    where: {
      status: { in: ["GENERATING", "PENDING"] },
      updatedAt: { lt: staleBefore },
    },
    select: { id: true, book: { select: { userId: true } } },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  for (const job of stuck) {
    await postInternal("/api/internal/audio", { audioId: job.id, userId: job.book.userId, chain: 0 });
  }
  return stuck.length;
}
