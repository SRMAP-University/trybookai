import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadReelView } from "@/lib/reel-generator/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownedReel(id: string, userId: string) {
  const reel = await db.storyReel.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true, deletedAt: true },
  });
  return reel && reel.userId === userId && !reel.deletedAt ? reel : null;
}

/** GET /api/reels/[id] — full timeline for the player and storyboard. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!(await ownedReel(id, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ reel: await loadReelView({ id }) });
}

/**
 * DELETE /api/reels/[id] — hide the reel and turn off its share link. The row
 * stays so its narration still counts against this month's allowance.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const reel = await ownedReel(id, session.user.id);
  if (!reel) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (reel.status === "GENERATING" || reel.status === "PENDING") {
    return NextResponse.json(
      { error: "Wait until the reel finishes before deleting it." },
      { status: 409 }
    );
  }

  await db.storyReel.update({
    where: { id },
    data: { deletedAt: new Date(), shareToken: null },
  });
  return NextResponse.json({ ok: true });
}
