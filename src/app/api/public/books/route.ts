import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const books = await db.book.findMany({
    where: { isPublic: true },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      genre: true,
      tone: true,
      coverImage: true,
      currentPages: true,
      targetPages: true,
      status: true,
      updatedAt: true,
      user: {
        select: {
          name: true,
          authorName: true,
          brandName: true,
        },
      },
      _count: { select: { chapters: true } },
    },
  });

  return NextResponse.json({
    books: books.map((book) => {
      const author =
        book.user.authorName ||
        book.user.brandName ||
        book.user.name ||
        "BookAI author";
      return {
        id: book.id,
        slug: book.slug,
        title: book.title,
        description: book.description,
        genre: book.genre,
        tone: book.tone,
        coverImage: book.coverImage,
        currentPages: book.currentPages,
        targetPages: book.targetPages,
        status: book.status,
        updatedAt: book.updatedAt,
        chapterCount: book._count.chapters,
        author,
      };
    }),
  });
}
