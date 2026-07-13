import type { StreamEmitter, StreamEvent } from "@/lib/book-generator/streaming";

const channels = new Map<string, Set<StreamEmitter>>();

export function subscribeBookEvents(
  bookId: string,
  emit: StreamEmitter
): () => void {
  if (!channels.has(bookId)) {
    channels.set(bookId, new Set());
  }
  channels.get(bookId)!.add(emit);
  return () => {
    channels.get(bookId)?.delete(emit);
    if (channels.get(bookId)?.size === 0) {
      channels.delete(bookId);
    }
  };
}

export function publishBookEvent(bookId: string, event: StreamEvent) {
  const listeners = channels.get(bookId);
  if (!listeners) return;
  for (const emit of listeners) {
    try {
      emit(event);
    } catch {
      /* listener disconnected */
    }
  }
}

export function createBookEventEmitter(bookId: string): StreamEmitter {
  return (event) => publishBookEvent(bookId, event);
}

export function mergeEmitters(...emitters: StreamEmitter[]): StreamEmitter {
  return (event) => {
    for (const emit of emitters) {
      emit(event);
    }
  };
}
