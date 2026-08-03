import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const book = await db.book.findFirst({
    where: { slug, isPublic: true },
    include: {
      chapters: {
        orderBy: { number: "asc" },
        select: {
          number: true,
          title: true,
          summary: true,
          pageCount: true,
          status: true,
          sections: {
            orderBy: { number: "asc" },
            select: {
              number: true,
              title: true,
              content: true,
              pageCount: true,
              wordCount: true,
            },
          },
        },
      },
      user: {
        select: {
          name: true,
          authorName: true,
          brandName: true,
        },
      },
    },
  });

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const author =
    book.user.authorName ||
    book.user.brandName ||
    book.user.name ||
    "BookAI author";

  const chapters = book.chapters
    .filter((c) => c.status === "COMPLETED")
    .map((chapter) => ({
      number: chapter.number,
      title: chapter.title,
      summary: chapter.summary,
      pageCount: chapter.pageCount,
      sections: chapter.sections.map((s) => ({
        number: s.number,
        title: s.title,
        content: s.content,
        pageCount: s.pageCount,
        wordCount: s.wordCount,
      })),
    }));

  return NextResponse.json({
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
    author,
    chapters,
  });
}
