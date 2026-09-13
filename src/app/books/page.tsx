import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { BookCover } from "@/components/dashboard/book-cover";
import { JsonLd } from "@/components/seo/json-ld";
import { genreToSlug, getAppUrl } from "@/lib/book-public";
import {
  breadcrumbJsonLd,
  buildPageMetadata,
  itemListJsonLd,
} from "@/lib/seo";

type Props = { searchParams: Promise<{ q?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const query = q?.trim();
  if (query) {
    return buildPageMetadata({
      title: `Search books: ${query}`,
      description: `Public AI-generated books matching “${query}” on BookAI.`,
      path: `/books?q=${encodeURIComponent(query)}`,
    });
  }

  return buildPageMetadata({
    title: "Public AI books library",
    description:
      "Browse free AI-generated books on BookAI. Read outlines, chapters, and full manuscripts from authors using AI.",
    path: "/books",
  });
}

export default async function PublicBooksPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = q?.trim();

  const books = await db.book.findMany({
    where: {
      isPublic: true,
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
              { genre: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 120,
    select: {
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

  const genreRows = await db.book.groupBy({
    by: ["genre"],
    where: { isPublic: true, genre: { not: null } },
  });
  const genres = genreRows
    .map((row) => row.genre)
    .filter((genre): genre is string => Boolean(genre))
    .sort((a, b) => a.localeCompare(b));

  const base = getAppUrl();

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Public books", path: "/books" },
        ])}
      />
      <JsonLd
        data={itemListJsonLd({
          name: query ? `Books matching ${query}` : "Public AI books",
          description:
            "Free AI-generated books you can read on BookAI.",
          url: query ? `${base}/books?q=${encodeURIComponent(query)}` : `${base}/books`,
          items: books.slice(0, 24).map((book) => ({
            name: book.title,
            url: `${base}/books/${book.slug}`,
          })),
        })}
      />
      <Navbar />
      <main className="min-h-screen bg-white pt-[72px]">
        <div className="mx-auto max-w-[960px] px-6 py-14">
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            {query ? `Results for “${query}”` : "Public AI books"}
          </h1>
          <p className="mt-2 max-w-xl text-[15px] text-[#697386]">
            {query
              ? "Matching manuscripts from the BookAI library."
              : "Read free books generated with BookAI. Every title has a public URL that search engines can index."}
          </p>

          <form action="/books" method="get" className="mt-6 max-w-md" role="search">
            <label htmlFor="book-search" className="sr-only">
              Search public books
            </label>
            <input
              id="book-search"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Search titles, genres, or topics…"
              className="w-full rounded-lg border border-[#e6ebf1] bg-white px-3 py-2 text-[14px] text-[#0a2540] outline-none placeholder:text-[#a3acb9] focus:border-[#635bff]"
            />
          </form>

          {genres.length > 0 && !query ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {genres.map((genre) => (
                <Link
                  key={genre}
                  href={`/books/genre/${genreToSlug(genre)}`}
                  className="rounded-full border border-[#e6ebf1] bg-[#f6f9fc] px-3 py-1 text-[13px] text-[#425466] hover:border-[#635bff]/40 hover:text-[#635bff]"
                >
                  {genre}
                </Link>
              ))}
            </div>
          ) : null}

          {query ? (
            <p className="mt-4 text-[13px]">
              <Link href="/books" className="text-[#635bff] hover:underline">
                ← All public books
              </Link>
            </p>
          ) : null}

          {books.length === 0 ? (
            <div className="mt-12 rounded-lg border border-dashed border-[#e6ebf1] px-6 py-16 text-center">
              <p className="text-[15px] font-medium text-[#0a2540]">
                {query ? "No matching books" : "No public books yet"}
              </p>
              <p className="mt-1 text-[14px] text-[#697386]">
                {query
                  ? "Try another search or browse the full library."
                  : "Create a book in your dashboard — it will appear here by default."}
              </p>
              <Link
                href={query ? "/books" : "/register"}
                className="mt-6 inline-block text-[14px] font-medium text-[#635bff] hover:underline"
              >
                {query ? "Browse all books →" : "Start writing →"}
              </Link>
            </div>
          ) : (
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
                        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-[17px] font-medium text-[#635bff]">
                            {book.title}
                          </h2>
                          <p className="mt-1 text-[13px] text-[#697386]">
                            {author}
                            {book.genre ? (
                              <>
                                {" · "}
                                <span className="text-[#635bff]">
                                  {book.genre}
                                </span>
                              </>
                            ) : null}
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
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
