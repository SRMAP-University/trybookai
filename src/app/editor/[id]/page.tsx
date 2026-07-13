import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BookEditor } from "@/components/dashboard/book-editor";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const book = await db.book.findUnique({
    where: { id },
    select: { title: true },
  });
  return {
    title: book ? `Edit — ${book.title}` : "Book editor",
  };
}

export default async function EditorPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const book = await db.book.findFirst({
    where: { id, userId: session.user.id },
    include: {
      chapters: {
        orderBy: { number: "asc" },
        include: {
          sections: { orderBy: { number: "asc" } },
        },
      },
    },
  });

  if (!book) notFound();

  if (book.chapters.length === 0) {
    redirect(`/dashboard/books/${id}`);
  }

  return (
    <BookEditor
      book={{
        id: book.id,
        title: book.title,
        status: book.status,
        wordsPerPage: book.wordsPerPage,
        chapters: book.chapters.map((ch) => ({
          id: ch.id,
          number: ch.number,
          title: ch.title,
          summary: ch.summary,
          sections: ch.sections.map((s) => ({
            id: s.id,
            number: s.number,
            title: s.title,
            content: s.content,
            pageCount: s.pageCount,
          })),
        })),
      }}
    />
  );
}
