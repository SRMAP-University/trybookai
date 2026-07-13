import Link from "next/link";
import { ArrowRight, BookOpen, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookCover } from "@/components/dashboard/book-cover";
import { getRecentLandingCovers } from "@/lib/landing-covers";
import { SAMPLE_BOOKS } from "@/lib/sample-books";

export async function PublicDashboardPreview() {
  const recentCovers = await getRecentLandingCovers(4);

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            Home
          </h1>
          <p className="mt-1 text-[14px] text-[#697386]">
            Explore BookAI before signing in.
          </p>
        </div>
        <Button
          className="h-9 rounded-md bg-[#635bff] px-4 text-[13px] hover:bg-[#5851e5]"
          asChild
        >
          <Link href="/login?callbackUrl=/dashboard">
            <BookOpen className="mr-1.5 h-3.5 w-3.5" />
            Sign in
          </Link>
        </Button>
      </div>

      {/* Promotional banner */}
      <div className="relative overflow-hidden rounded-xl bg-[#0a2540] p-6 sm:p-7">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent, transparent 11px, #fff 11px, #fff 12px)",
          }}
        />
        <div className="absolute -right-16 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-[#635bff]/35 blur-3xl" />
        <div className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-rose-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
              <Wand2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-white sm:text-[22px]">
                Generate full-length books with AI
              </h2>
              <p className="mt-1.5 max-w-[440px] text-[13px] leading-relaxed text-white/65">
                Outline, write, and export manuscripts up to hundreds of pages
                — with your style, characters, and branding.
              </p>
            </div>
          </div>
          <Button
            className="h-9 shrink-0 rounded-md bg-white px-4 text-[13px] font-medium text-[#0a2540] hover:bg-white/90"
            asChild
          >
            <Link href="/register?callbackUrl=/dashboard">
              Create free account
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Feature cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="relative overflow-hidden rounded-xl border border-[#e6ebf1] bg-[#f6f9fc] p-6">
          <div className="relative">
            <h2 className="max-w-[280px] text-[22px] font-semibold tracking-[-0.03em] text-[#0a2540]">
              Turn a premise into a manuscript
            </h2>
            <p className="mt-2 max-w-[320px] text-[13px] leading-relaxed text-[#425466]">
              Describe your idea and let AI build the outline, chapters, and
              prose — then export to Markdown or DOCX.
            </p>
            <Button
              className="mt-5 h-9 rounded-md bg-[#635bff] px-4 text-[13px] hover:bg-[#5851e5]"
              asChild
            >
              <Link href="/register?callbackUrl=/dashboard/books/new">
                Start creating
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-[#e6ebf1] bg-[#f6f9fc] p-6">
          <div className="relative">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#635bff]" />
              <h2 className="max-w-[280px] text-[22px] font-semibold tracking-[-0.03em] text-[#0a2540]">
                Branding & publishing
              </h2>
            </div>
            <p className="mt-2 max-w-[320px] text-[13px] leading-relaxed text-[#425466]">
              Customize author name, imprint, copyright, cover style, and export
              settings for professional-ready books.
            </p>
            <Button
              variant="outline"
              className="mt-5 h-9 rounded-md border-[#e6ebf1] px-4 text-[13px] text-[#0a2540] hover:bg-white"
              asChild
            >
              <Link href="/register?callbackUrl=/dashboard">
                Get started
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
