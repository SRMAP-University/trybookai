import { NextResponse, after } from "next/server";
import { z } from "zod";
import { ensureAudioGenerationById } from "@/lib/audio-generator/background";
import { isInternalRequest } from "@/lib/internal-call";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  audioId: z.string().min(1),
  userId: z.string().min(1),
  chain: z.number().int().min(0).max(1000).optional(),
});

/**
 * POST /api/internal/audio
 * Carry on an audio job in a fresh function: called by a run that stopped
 * before the time limit, and by the daily sweep for jobs whose runner died.
 */
export async function POST(request: Request) {
  if (!isInternalRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { audioId, userId, chain } = parsed.data;
  try {
    const { started, task } = await ensureAudioGenerationById(audioId, userId, { chain });
    if (task) after(() => task);
    return NextResponse.json({ started }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not resume audio";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
