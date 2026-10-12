import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAppUrl } from "@/lib/book-public";
import { newShareToken } from "@/lib/reel-generator/create";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownedReel(id: string, userId: string) {
  const reel = await db.storyReel.findUnique({
    where: { id },
    select: { userId: true, shareToken: true, deletedAt: true },
  });
  return reel && reel.userId === userId && !reel.deletedAt ? reel : null;
}

/**
 * POST /api/reels/[id]/share — get the unlisted share link, creating it on
 * first use. `{ "reset": true }` issues a new link and stops the old one.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const reel = await ownedReel(id, session.user.id);
  if (!reel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { reset?: unknown };
  let shareToken = reel.shareToken;
  if (!shareToken || body.reset === true) {
    shareToken = newShareToken();
    await db.storyReel.update({ where: { id }, data: { shareToken } });
  }
  return NextResponse.json({ shareToken, url: `${getAppUrl()}/r/${shareToken}` });
}

/** DELETE /api/reels/[id]/share — turn the share link off. */
export async function DELETE(
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
  await db.storyReel.update({ where: { id }, data: { shareToken: null } });
  return NextResponse.json({ ok: true });
}
