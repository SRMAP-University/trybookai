import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { BookCover } from "@/components/dashboard/book-cover";
import { JsonLd } from "@/components/seo/json-ld";
import { displayGenreFromSlug, genreToSlug, getAppUrl } from "@/lib/book-public";
import {
  breadcrumbJsonLd,
  buildPageMetadata,
  itemListJsonLd,
} from "@/lib/seo";

type Props = { params: Promise<{ genre: string }> };

async function resolveGenre(slug: string) {
  const rows = await db.book.groupBy({
    by: ["genre"],
    where: { isPublic: true, genre: { not: null } },
  });
  return rows.find((row) => row.genre && genreToSlug(row.genre) === slug)?.genre ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { genre: slug } = await params;
  const genre = (await resolveGenre(slug)) ?? displayGenreFromSlug(slug);
  return buildPageMetadata({
    title: `${genre} AI books`,
    description: `Read free ${genre.toLowerCase()} books generated with BookAI. Browse AI-written ${genre.toLowerCase()} manuscripts, outlines, and public chapters.`,
    path: `/books/genre/${slug}`,
    keywords: [
      `${genre} AI books`,
      `AI ${genre.toLowerCase()} generator`,
      `write a ${genre.toLowerCase()} book with AI`,
      "BookAI library",
    ],
  });
}

export default async function GenreBooksPage({ params }: Props) {
  const { genre: slug } = await params;
  const genre = await resolveGenre(slug);
  if (!genre) notFound();

  const books = await db.book.findMany({
    where: { isPublic: true, genre },
    orderBy: { updatedAt: "desc" },
    take: 80,
    select: {
      slug: true,
      title: true,
      description: true,
      genre: true,
      coverImage: true,
      currentPages: true,
      targetPages: true,
      user: { select: { name: true, authorName: true, brandName: true } },
      _count: { select: { chapters: true } },
    },
  });

  if (books.length === 0) notFound();

  const base = getAppUrl();
  const path = `/books/genre/${slug}`;

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Public books", path: "/books" },
          { name: genre, path },
        ])}
      />
      <JsonLd
        data={itemListJsonLd({
          name: `${genre} AI books`,
          description: `Public ${genre} books generated with BookAI.`,
          url: `${base}${path}`,
          items: books.slice(0, 24).map((book) => ({
            name: book.title,
            url: `${base}/books/${book.slug}`,
          })),
        })}
      />
      <Navbar />
      <main className="min-h-screen bg-white pt-[72px]">
        <div className="mx-auto max-w-[960px] px-6 py-14">
          <nav className="text-[13px] text-[#697386]">
            <Link href="/books" className="hover:text-[#635bff]">
              Public books
            </Link>
            <span className="mx-2">/</span>
            <span className="text-[#0a2540]">{genre}</span>
          </nav>
          <h1 className="mt-4 text-[32px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            {genre} books
          </h1>
          <p className="mt-2 max-w-xl text-[15px] text-[#697386]">
            Free {genre.toLowerCase()} manuscripts written with BookAI. Open any
            title to read chapters on the public book page.
          </p>

          <ul className="mt-10 divide-y divide-[#e6ebf1] border-y border-[#e6ebf1]">
            {books.map((book) => {
              const author =
                book.user.authorName ||
                book.user.brandName ||
                book.user.name ||
                "BookAI author";
              return (
                <li key={book.slug}>
                  <Link
                    href={`/books/${book.slug}`}
                    className="block py-5 transition-colors hover:bg-[#f6f9fc]"
                  >
                    <div className="flex flex-wrap items-start gap-4">
                      <BookCover
                        title={book.title}
                        coverImage={book.coverImage}
                        aspect="card"
                        className="w-[72px] shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <h2 className="text-[17px] font-medium text-[#635bff]">
                          {book.title}
                        </h2>
                        <p className="mt-1 text-[13px] text-[#697386]">
                          {author}
                          {book._count.chapters > 0
                            ? ` · ${book._count.chapters} chapters`
                            : ""}
                          {` · ${book.currentPages}/${book.targetPages} pages`}
                        </p>
                        {book.description && (
                          <p className="mt-2 line-clamp-2 max-w-2xl text-[14px] text-[#425466]">
                            {book.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </main>
      <Footer />
    </>
  );
}
