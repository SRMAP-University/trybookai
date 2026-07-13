import { db } from "@/lib/db";
import { isAudioGenerationActive } from "@/lib/audio-generator/background";
import { subscribeAudioEvents } from "@/lib/audio-generator/events";
import type { AudioStreamEmitter } from "@/lib/audio-generator/events";

const POLL_MS = 800;

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

export async function watchAudioGenerationStream(
  audioId: string,
  userId: string,
  emit: AudioStreamEmitter,
  signal?: AbortSignal
) {
  const audio = await db.bookAudio.findUnique({
    where: { id: audioId },
    include: { book: true, tracks: { orderBy: { number: "asc" } } },
  });

  if (!audio || audio.book.userId !== userId) {
    emit({ type: "error", message: "Audio job not found" });
    return;
  }

  emit({
    type: "progress",
    progress: audio.progress,
    status: audio.status,
    audioType: audio.type,
  });

  if (audio.status === "COMPLETED") {
    emit({ type: "done", audioType: audio.type, audioId });
    return;
  }

  if (audio.status === "FAILED") {
    emit({
      type: "error",
      message: audio.errorMessage ?? "Audio generation failed",
      audioType: audio.type,
    });
    return;
  }

  const unsubscribe = subscribeAudioEvents(audioId, emit);

  try {
    while (!signal?.aborted) {
      if (!isAudioGenerationActive(audioId)) {
        const latest = await db.bookAudio.findUnique({
          where: { id: audioId },
        });
        if (!latest) {
          emit({ type: "error", message: "Audio job missing" });
          break;
        }
        if (latest.status === "COMPLETED") {
          emit({
            type: "progress",
            progress: 100,
            status: "COMPLETED",
            audioType: latest.type,
          });
          emit({ type: "done", audioType: latest.type, audioId });
          break;
        }
        if (latest.status === "FAILED") {
          emit({
            type: "error",
            message: latest.errorMessage ?? "Audio generation failed",
            audioType: latest.type,
          });
          break;
        }
        if (latest.status === "PENDING" || latest.status === "GENERATING") {
          // Job may restart shortly
          await sleep(POLL_MS, signal);
          continue;
        }
      }

      await sleep(POLL_MS, signal);
    }
  } finally {
    unsubscribe();
  }
}
