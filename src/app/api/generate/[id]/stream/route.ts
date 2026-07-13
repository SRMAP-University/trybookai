import { after } from "next/server";
import { auth } from "@/lib/auth";
import { ensureGenerationRunning } from "@/lib/book-generator/background";
import { type StreamEvent } from "@/lib/book-generator/streaming";
import { watchGenerationStream } from "@/lib/book-generator/watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function encodeSse(event: StreamEvent): string {
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

  try {
    await ensureGenerationRunning(id, session.user.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generation failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  after(() => {
    ensureGenerationRunning(id, session.user.id).catch((error) => {
      console.error("Failed to resume background generation:", error);
    });
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeSse(event)));
        } catch {
          /* client disconnected */
        }
      };

      try {
        await watchGenerationStream(
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
