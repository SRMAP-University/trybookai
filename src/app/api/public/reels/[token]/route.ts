import { NextResponse } from "next/server";
import { loadSharedReel } from "@/lib/reel-generator/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/public/reels/[token] — timeline behind a share link. No sign-in. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const shared = await loadSharedReel(token);
  if (!shared) {
    return NextResponse.json({ error: "This link doesn't work anymore." }, { status: 404 });
  }
  return NextResponse.json({
    reel: shared.reel,
    book: {
      title: shared.book.title,
      url: shared.book.isPublic ? `/books/${shared.book.slug}` : null,
    },
  });
}
