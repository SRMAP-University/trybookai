import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { getAppUrl } from "@/lib/book-public";
import { BookCover } from "@/components/dashboard/book-cover";

export const metadata: Metadata = {
  title: "Public books — BookAI",
  description:
    "Browse AI-generated books published on BookAI. Read outlines, chapters, and full manuscripts.",
  alternates: { canonical: `${getAppUrl()}/books` },
  openGraph: {
    title: "Public books — BookAI",
    description:
      "Browse AI-generated books published on BookAI. Read outlines, chapters, and full manuscripts.",
    url: `${getAppUrl()}/books`,
    type: "website",
  },
};

export default async function PublicBooksPage() {
  const books = await db.book.findMany({
    where: { isPublic: true },
    orderBy: { updatedAt: "desc" },
    take: 60,
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

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white pt-[72px]">
        <div className="mx-auto max-w-[960px] px-6 py-14">
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            Public books
          </h1>
          <p className="mt-2 max-w-xl text-[15px] text-[#697386]">
            Discover manuscripts generated with BookAI. Every book has a unique
            public ID and is indexable for search.
          </p>

          {books.length === 0 ? (
            <div className="mt-12 rounded-lg border border-dashed border-[#e6ebf1] px-6 py-16 text-center">
              <p className="text-[15px] font-medium text-[#0a2540]">
                No public books yet
              </p>
              <p className="mt-1 text-[14px] text-[#697386]">
                Create a book in your dashboard — it will appear here by
                default.
              </p>
              <Link
                href="/register"
                className="mt-6 inline-block text-[14px] font-medium text-[#635bff] hover:underline"
              >
                Start writing →
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
                            {book.genre ? ` · ${book.genre}` : ""}
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
                        <span className="shrink-0 rounded bg-[#f6f9fc] px-2 py-1 font-mono text-[11px] text-[#697386]">
                          {book.slug}
                        </span>
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
