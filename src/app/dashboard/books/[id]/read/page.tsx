import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { BookReader } from "@/components/reader/book-reader";
import { loadReaderBook } from "@/lib/reader/load";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fresh?: string }>;
};

export const metadata: Metadata = { title: "Reading", robots: { index: false } };

/** /dashboard/books/[id]/read: the owner's book, public or private, as a book. */
export default async function ReadOwnBookPage({ params, searchParams }: Props) {
  const session = await auth();
  const { id } = await params;
  if (!session?.user?.id) redirect(`/login?callbackUrl=/dashboard/books/${id}/read`);
  const { fresh } = await searchParams;

  const book = await loadReaderBook(
    { id, userId: session.user.id },
    (b) => `/api/books/${b.id}/cover-image`
  );
  if (!book || book.chapters.length === 0) notFound();
  return <BookReader book={book} exitHref={`/dashboard/books/${id}`} fresh={fresh === "1"} />;
}
