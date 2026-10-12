import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toPublicReelView, toReelView } from "@/lib/reel-generator/timeline";
import type { ReelFeedPage } from "@/lib/reel-generator/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reels per page. */
const PAGE_SIZE = 6;
/** Parts of one reel sent with it; a long chapter series continues on the book page. */
const PARTS_PER_REEL = 6;

/**
 * GET /api/public/reel-feed?cursor= — the public feed: reels of public books
 * with at least one finished video, newest first. Private books never appear.
 */
export async function GET(request: Request) {
  const cursor = new URL(request.url).searchParams.get("cursor");

  const reels = await db.storyReel.findMany({
    where: {
      deletedAt: null,
      book: { isPublic: true },
      episodes: { some: { status: "COMPLETED" } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      episodes: {
        where: { status: "COMPLETED" },
        orderBy: { number: "asc" },
        take: PARTS_PER_REEL,
        include: { shots: { orderBy: { number: "asc" } } },
      },
      book: {
        select: {
          title: true,
          slug: true,
          user: { select: { authorName: true, brandName: true, name: true } },
        },
      },
      _count: { select: { episodes: { where: { status: "COMPLETED" } } } },
    },
  });

  const page = reels.slice(0, PAGE_SIZE);
  const body: ReelFeedPage = {
    items: page.map((reel) => ({
      reel: toPublicReelView(toReelView(reel)),
      book: {
        title: reel.book.title,
        slug: reel.book.slug,
        author:
          reel.book.user.authorName ||
          reel.book.user.brandName ||
          reel.book.user.name ||
          "BookAI author",
      },
      totalParts: reel._count.episodes,
    })),
    nextCursor: reels.length > PAGE_SIZE ? page[page.length - 1].id : null,
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
  });
}
