import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ReelError } from "@/lib/reel-generator/create";
import { editShot } from "@/lib/reel-generator/reroll";
import { REEL_MOTIONS, normalizeMood, normalizeMotion } from "@/lib/reel-generator/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const editSchema = z.object({
  description: z.string().max(400).optional(),
  motion: z.enum(REEL_MOTIONS).optional(),
  redraw: z.boolean().optional(),
  undo: z.boolean().optional(),
});

/** POST /api/reels/[id]/shots/[shotId] — re-roll, re-describe, change the camera move, or undo. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; shotId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { id, shotId } = await params;
  try {
    const shot = await editShot({
      userId: session.user.id,
      reelId: id,
      shotId,
      edit: parsed.data,
    });
    return NextResponse.json({
      shot: {
        id: shot.id,
        number: shot.number,
        text: shot.text,
        description: shot.description,
        startMs: shot.startMs,
        endMs: shot.endMs,
        imageUrl: shot.imageUrl,
        previousImageUrl: shot.previousImageUrl,
        motion: normalizeMotion(shot.motion),
        mood: normalizeMood(shot.mood),
        status: shot.status,
        rerolls: shot.rerolls,
      },
    });
  } catch (error) {
    if (error instanceof ReelError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[reels] shot edit failed:", error);
    return NextResponse.json({ error: "Couldn't update the shot." }, { status: 500 });
  }
}
