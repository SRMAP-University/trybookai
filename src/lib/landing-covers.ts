import { db } from "@/lib/db";
import { SAMPLE_BOOKS } from "@/lib/sample-books";

export type LandingCoverBook = {
  id: string;
  title: string;
  genre: string | null;
  coverImage: string | null;
  slug?: string | null;
  isSample?: boolean;
};

const SAMPLE_AS_LANDING: LandingCoverBook[] = SAMPLE_BOOKS.map((b) => ({
  id: b.id,
  title: b.title,
  genre: b.genre,
  coverImage: null,
  isSample: true,
}));

/**
 * Recent public books with covers, for the landing page and dashboard
 * showcases. Private books never appear: these surfaces are public.
 */
export async function getRecentLandingCovers(
  limit = 4
): Promise<LandingCoverBook[]> {
  const recent = await db.book
    .findMany({
      where: {
        isPublic: true,
        coverImage: { not: null },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: limit,
      select: {
        id: true,
        title: true,
        genre: true,
        coverImage: true,
        slug: true,
      },
    })
    .catch((error) => {
      // Builds without a database (Vercel previews) render the sample covers;
      // the page's revalidation picks up real ones.
      console.warn(
        "[landing] database unavailable; using sample covers:",
        error instanceof Error ? error.message : error
      );
      return [];
    });

  const books: LandingCoverBook[] = recent.map((b) => ({
    id: b.id,
    title: b.title,
    genre: b.genre,
    coverImage: b.coverImage,
    slug: b.slug,
    isSample: false,
  }));

  if (books.length >= limit) return books.slice(0, limit);

  // Pad with samples so the fan always has 4 covers
  const needed = limit - books.length;
  return [...books, ...SAMPLE_AS_LANDING.slice(0, needed)];
}
