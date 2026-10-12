import type { ReelStreamEvent } from "@/lib/reel-generator/types";

export type ReelStreamEmitter = (event: ReelStreamEvent) => void;

/** In-process listeners per reel; other servers fall back to polling the database. */
const channels = new Map<string, Set<ReelStreamEmitter>>();

export function subscribeReelEvents(
  reelId: string,
  emit: ReelStreamEmitter
): () => void {
  if (!channels.has(reelId)) channels.set(reelId, new Set());
  channels.get(reelId)!.add(emit);
  return () => {
    channels.get(reelId)?.delete(emit);
    if (channels.get(reelId)?.size === 0) channels.delete(reelId);
  };
}

export function publishReelEvent(reelId: string, event: ReelStreamEvent) {
  const listeners = channels.get(reelId);
  if (!listeners) return;
  for (const emit of listeners) {
    try {
      emit(event);
    } catch {
      /* disconnected */
    }
  }
}

export function createReelEventEmitter(reelId: string): ReelStreamEmitter {
  return (event) => publishReelEvent(reelId, event);
}
