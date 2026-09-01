import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookCover } from "@/components/dashboard/book-cover";
import { DashboardCreatePrompt } from "@/components/dashboard/dashboard-create-prompt";
import { getRecentLandingCovers } from "@/lib/landing-covers";
import { SAMPLE_BOOKS } from "@/lib/sample-books";

export async function PublicDashboardPreview() {
  const recentCovers = await getRecentLandingCovers(4);
  const showcaseCovers = recentCovers.slice(0, 2).map((book) => ({
    id: book.id,
    title: book.title,
    genre: book.genre,
    coverImage: book.coverImage,
    href: book.slug ? `/books/${book.slug}` : "/books",
  }));

  return (
    <div className="space-y-8 lg:space-y-10">
      <DashboardCreatePrompt
        pagesRemaining={50}
        pagesLimit={50}
        signInHref="/register?callbackUrl=/dashboard"
        showcaseCovers={showcaseCovers}
      />

      {/* Latest covers */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-medium text-[#0a2540]">
              Latest covers
            </h2>
            <p className="mt-0.5 text-[13px] text-[#697386]">
              Recently generated book covers from BookAI.
            </p>
          </div>
          <Link
            href="/books"
            className="text-[13px] text-[#635bff] hover:underline"
          >
            Browse all
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {recentCovers.map((book, i) => {
            const sample = SAMPLE_BOOKS[i % SAMPLE_BOOKS.length];
            const href = book.slug
              ? `/books/${book.slug}`
              : sample
                ? `/books?template=${sample.templateId}&title=${encodeURIComponent(book.title)}`
                : "/books";

            return (
              <Link
                key={book.id}
                href={href}
                className="group overflow-hidden rounded-lg border border-[#e6ebf1] bg-white transition-colors hover:border-[#635bff]/40"
              >
                <BookCover
                  title={book.title}
                  coverImage={book.coverImage}
                  aspect="card"
                  className="rounded-none border-0 shadow-none ring-0"
                />
                <div className="p-3">
                  <p className="line-clamp-1 text-[13px] font-medium text-[#0a2540] group-hover:text-[#635bff]">
                    {book.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#697386]">
                    {book.genre ?? "Book"}
                    {book.isSample ? " · Sample" : ""}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Anonymous CTA */}
      <section className="rounded-xl border border-dashed border-[#e6ebf1] bg-[#f8fafc] px-6 py-10 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f0efff] text-[#635bff]">
          <BookOpen className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-[17px] font-semibold tracking-[-0.02em] text-[#0a2540]">
          Ready to write your book?
        </h2>
        <p className="mx-auto mt-1 max-w-[380px] text-[14px] text-[#697386]">
          Sign in to create books, track generation progress, and export your
          manuscripts.
        </p>
        <Button
          className="mt-6 h-9 rounded-md bg-[#635bff] px-4 text-[13px] hover:bg-[#5851e5]"
          asChild
        >
          <Link href="/register?callbackUrl=/dashboard">
            Create free account
          </Link>
        </Button>
      </section>
    </div>
  );
}
