import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stripImageLines, stripReasoning } from "@/lib/manuscript-clean";

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
          imageUrl: true,
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
      /** Chapter-opener illustration */
      imageUrl: chapter.imageUrl,
      sections: chapter.sections.map((s) => {
        const markdown = s.content ? stripReasoning(s.content) : s.content;
        return {
          number: s.number,
          title: s.title,
          // The app shows `content` as plain text, so picture lines would appear as raw URLs.
          content: markdown ? stripImageLines(markdown) : markdown,
          /** Full markdown including `![caption](url)` picture lines, for clients that render them */
          markdown,
          pageCount: s.pageCount,
          wordCount: s.wordCount,
        };
      }),
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
