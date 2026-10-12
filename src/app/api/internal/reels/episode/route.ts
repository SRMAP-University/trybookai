import { NextResponse } from "next/server";
import { z } from "zod";
import { buildEpisodeById } from "@/lib/reel-generator/runner";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({ episodeId: z.string().min(1) });

function authorize(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;
  const secrets = [process.env.GENERATION_WORKER_SECRET, process.env.CRON_SECRET].filter(
    Boolean
  ) as string[];
  return secrets.some((s) => s === token);
}

/**
 * POST /api/internal/reels/episode
 * Called by the Cloudflare worker to build one reel episode end to end.
 * Safe to call twice: saved steps are skipped.
 */
export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    await buildEpisodeById(parsed.data.episodeId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Episode build failed";
    console.error(`[reels] internal episode ${parsed.data.episodeId} failed:`, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
