import type { AudioDerivativeType } from "@/generated/prisma/client";

export type AudioStreamEvent =
  | {
      type: "phase";
      message: string;
      audioType: AudioDerivativeType;
    }
  | {
      type: "progress";
      progress: number;
      status: string;
      audioType: AudioDerivativeType;
      trackNumber?: number;
      trackTitle?: string;
    }
  | {
      type: "track_done";
      trackNumber: number;
      trackTitle: string;
      audioUrl: string;
      audioType: AudioDerivativeType;
    }
  | {
      type: "done";
      audioType: AudioDerivativeType;
      audioId: string;
    }
  | { type: "error"; message: string; audioType?: AudioDerivativeType };

export type AudioStreamEmitter = (event: AudioStreamEvent) => void;

const channels = new Map<string, Set<AudioStreamEmitter>>();

function channelKey(audioId: string) {
  return audioId;
}

export function subscribeAudioEvents(
  audioId: string,
  emit: AudioStreamEmitter
): () => void {
  const key = channelKey(audioId);
  if (!channels.has(key)) channels.set(key, new Set());
  channels.get(key)!.add(emit);
  return () => {
    channels.get(key)?.delete(emit);
    if (channels.get(key)?.size === 0) channels.delete(key);
  };
}

export function publishAudioEvent(audioId: string, event: AudioStreamEvent) {
  const listeners = channels.get(channelKey(audioId));
  if (!listeners) return;
  for (const emit of listeners) {
    try {
      emit(event);
    } catch {
      /* disconnected */
    }
  }
}

export function createAudioEventEmitter(audioId: string): AudioStreamEmitter {
  return (event) => publishAudioEvent(audioId, event);
}
