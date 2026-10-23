import { after } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ensureAudioGenerationById,
  ensureAudioGenerationRunning,
} from "@/lib/audio-generator/background";
import type { AudioStreamEvent } from "@/lib/audio-generator/events";
import { watchAudioGenerationStream } from "@/lib/audio-generator/watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function encodeSse(event: AudioStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = await params;

  const audio = await db.bookAudio.findUnique({
    where: { id },
    include: { book: { select: { userId: true, id: true } } },
  });

  if (!audio || audio.book.userId !== session.user.id) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Start or resume the job here (a GENERATING job whose runner died is taken
  // over, keeping its finished chapters) and keep this function alive for it.
  let task: Promise<void> | undefined;
  try {
    if (audio.status === "PENDING" || audio.status === "FAILED") {
      const result = await ensureAudioGenerationRunning({
        bookId: audio.bookId,
        userId: session.user.id,
        type: audio.type,
        regenerate: audio.status === "FAILED",
      });
      task = "task" in result ? result.task : undefined;
    } else if (audio.status === "GENERATING") {
      task = (await ensureAudioGenerationById(id, session.user.id)).task;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Audio generation failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (task) after(() => task);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: AudioStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeSse(event)));
        } catch {
          /* client disconnected */
        }
      };

      try {
        await watchAudioGenerationStream(
          id,
          session.user.id,
          emit,
          request.signal
        );
      } catch (error) {
        if (request.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Stream failed";
        emit({ type: "error", message });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
