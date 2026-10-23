import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookReader } from "@/components/reader/book-reader";
import { loadReaderBook } from "@/lib/reader/load";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: "Reading",
    // The book page itself is the indexed version of this text.
    robots: { index: false, follow: true },
    alternates: { canonical: `/books/${slug}` },
  };
}

/** /books/[slug]/read: a public book as a book, with pages that turn. */
export default async function ReadPublicBookPage({ params }: Props) {
  const { slug } = await params;
  const book = await loadReaderBook(
    { slug, isPublic: true },
    (b) => `/api/books/cover/${b.slug}`
  );
  if (!book || book.chapters.length === 0) notFound();
  return <BookReader book={book} exitHref={`/books/${slug}`} visitor />;
}
