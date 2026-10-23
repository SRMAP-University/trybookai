import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isNarrativeBook } from "@/lib/book-generator/core/format";
import type { ReaderBook } from "@/components/reader/book-reader";

/**
 * A finished book's chapters as the reader needs them. `coverUrl` is how this
 * page's viewer can load the cover (the public proxy, or the owner's route).
 */
export async function loadReaderBook(
  where: Prisma.BookWhereInput,
  coverUrl: (book: { id: string; slug: string }) => string
): Promise<(ReaderBook & { slug: string }) | null> {
  const book = await db.book.findFirst({
    where,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      genre: true,
      templateId: true,
      language: true,
      coverImage: true,
      user: { select: { authorName: true, name: true } },
      chapters: {
        where: { status: "COMPLETED" },
        orderBy: { number: "asc" },
        select: {
          number: true,
          title: true,
          imageUrl: true,
          sections: { orderBy: { number: "asc" }, select: { title: true, content: true } },
        },
      },
    },
  });
  if (!book) return null;

  const chapters = book.chapters.filter((c) => c.sections.some((s) => s.content?.trim()));
  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    author: book.user.authorName || book.user.name || null,
    description: book.description,
    coverImage: book.coverImage ? coverUrl(book) : null,
    language: book.language,
    narrative: isNarrativeBook({ genre: book.genre, templateId: book.templateId }),
    illustrated: chapters.some(
      (c) => c.imageUrl || c.sections.some((s) => s.content?.includes("/illustrations/"))
    ),
    chapters,
  };
}
