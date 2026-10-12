import { after } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureReelGenerationRunning } from "@/lib/reel-generator/background";
import type { ReelStreamEvent } from "@/lib/reel-generator/types";
import { watchReelStream } from "@/lib/reel-generator/watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function encodeSse(event: ReelStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST /api/reels/[id]/stream — live progress over SSE. Restarts the job if
 * no server is running it (stale heartbeat); `{ "retry": true }` restarts a
 * failed reel's unfinished videos.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Unauthorized" }, 401);

  const { id } = await params;
  const reel = await db.storyReel.findUnique({
    where: { id },
    select: { userId: true, deletedAt: true },
  });
  if (!reel || reel.userId !== session.user.id || reel.deletedAt) {
    return json({ error: "Not found" }, 404);
  }

  const body = (await request.json().catch(() => ({}))) as { retry?: unknown };
  try {
    const result = await ensureReelGenerationRunning(id, { retry: body.retry === true });
    // Keep the function alive for the job even if the viewer leaves.
    if (result.task) after(() => result.task);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Couldn't resume the reel" },
      400
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: ReelStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeSse(event)));
        } catch {
          /* client disconnected */
        }
      };
      try {
        await watchReelStream(id, emit, request.signal);
      } catch (error) {
        if (!request.signal.aborted) {
          emit({
            type: "error",
            message: error instanceof Error ? error.message : "Stream failed",
          });
        }
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
