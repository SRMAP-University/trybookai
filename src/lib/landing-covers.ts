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

/** Recent books with covers for the landing hero (public only). */
export async function getRecentLandingCovers(
  limit = 4
): Promise<LandingCoverBook[]> {
  const recent = await db.book.findMany({
    where: {
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
      isPublic: true,
    },
  });

  const books: LandingCoverBook[] = recent.map((b) => ({
    id: b.id,
    title: b.title,
    genre: b.genre,
    coverImage: b.coverImage,
    slug: b.isPublic ? b.slug : null,
    isSample: false,
  }));

  if (books.length >= limit) return books.slice(0, limit);

  // Pad with samples so the fan always has 4 covers
  const needed = limit - books.length;
  return [...books, ...SAMPLE_AS_LANDING.slice(0, needed)];
}
