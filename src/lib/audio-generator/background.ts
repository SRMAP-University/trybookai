import { db } from "@/lib/db";
import type { AudioDerivativeType } from "@/generated/prisma/client";
import {
  ensureAudioRecord,
  runAudioGeneration,
} from "@/lib/audio-generator/streaming";
import { createAudioEventEmitter } from "@/lib/audio-generator/events";
import type { VoiceSettingsConfig } from "@/lib/elevenlabs-voices";

const activeAudioJobs = new Map<string, Promise<void>>();

export function isAudioGenerationActive(audioId: string) {
  return activeAudioJobs.has(audioId);
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
    return { audio, started: false, alreadyRunning: true };
  }

  if (audio.status === "COMPLETED") {
    return { audio, started: false, alreadyRunning: false, completed: true };
  }

  const emit = createAudioEventEmitter(audio.id);
  const task = runAudioGeneration(audio.id, params.userId, emit)
    .catch((error) => {
      console.error(`Audio generation failed for ${audio.id}:`, error);
    })
    .finally(() => {
      activeAudioJobs.delete(audio.id);
    });

  activeAudioJobs.set(audio.id, task);
  return { audio, started: true, alreadyRunning: false };
}

export async function ensureAudioGenerationById(
  audioId: string,
  userId: string
) {
  const existing = activeAudioJobs.get(audioId);
  if (existing) {
    return { started: false, alreadyRunning: true };
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

  const emit = createAudioEventEmitter(audioId);
  const task = runAudioGeneration(audioId, userId, emit)
    .catch((error) => {
      console.error(`Audio generation failed for ${audioId}:`, error);
    })
    .finally(() => {
      activeAudioJobs.delete(audioId);
    });

  activeAudioJobs.set(audioId, task);
  return { started: true, alreadyRunning: false };
}
