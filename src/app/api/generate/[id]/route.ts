import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  ensureGenerationRunning,
  GenerationPausedError,
} from "@/lib/book-generator/background";
import {
  applyGenerationSpeed,
  parseGenerationSpeed,
} from "@/lib/book-generator/generation-speed";
import { getAppVersion, resolveClientSource } from "@/lib/client-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const resume = new URL(request.url).searchParams.get("resume") === "1";
  const client = resolveClientSource(request);
  const appVersion = getAppVersion(request);

  const body = (await request.json().catch(() => null)) as {
    speed?: unknown;
  } | null;
  const speed = parseGenerationSpeed(body?.speed);

  try {
    if (speed) {
      await applyGenerationSpeed(id, session.user.id, speed);
    }
    // Enqueues to Cloudflare Workflows (or local queue). Does not run prose on Vercel.
    const result = await ensureGenerationRunning(id, session.user.id, resume, {
      client,
      appVersion,
    });
    return NextResponse.json(
      {
        queued: result.queued,
        alreadyRunning: result.alreadyRunning,
        completed: result.completed ?? false,
        jobId: result.jobId,
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof GenerationPausedError) {
      return NextResponse.json(
        { error: error.message, paused: true },
        { status: 409 }
      );
    }
    const message =
      error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
