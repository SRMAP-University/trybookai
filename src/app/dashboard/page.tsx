import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ArrowRight,
  BookOpen,
  Clapperboard,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DashboardUpgradeBanner } from "@/components/dashboard/dashboard-upgrade-banner";
import { DashboardTrialSection } from "@/components/dashboard/dashboard-trial-section";
import { DashboardBookCard } from "@/components/dashboard/book-card";
import { BookCover } from "@/components/dashboard/book-cover";
import { PublicDashboardPreview } from "@/components/dashboard/public-preview";
import { getRecentLandingCovers } from "@/lib/landing-covers";
import { SAMPLE_BOOKS } from "@/lib/sample-books";
import { isTrialActive, syncUserTrialState } from "@/lib/billing";
import { AUDIO_STUDIO_GENRE } from "@/lib/audio-studio";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return <PublicDashboardPreview />;
  }

  const user = await syncUserTrialState(session.user.id);
  const onTrial = isTrialActive(user);

  const books = await db.book.findMany({
    where: {
      userId: session.user.id,
      NOT: { genre: AUDIO_STUDIO_GENRE },
    },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { chapters: true } } },
  });

  const recentCovers = await getRecentLandingCovers(4);

  const pagesRemaining = user.pagesLimit - user.pagesUsed;
  const usagePercent =
    user.pagesLimit > 0
      ? Math.round((user.pagesUsed / user.pagesLimit) * 100)
      : 0;
  const generating = books.filter(
    (b) => b.status === "GENERATING" || b.status === "OUTLINING"
  );
  const completed = books.filter((b) => b.status === "COMPLETED");
  const firstName = user.name?.split(" ")[0];

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            Home
          </h1>
          <p className="mt-1 text-[14px] text-[#697386]">
            {firstName ? `Welcome back, ${firstName}` : "Your workspace"}
          </p>
        </div>
        <Button
          className="h-9 rounded-md bg-[#635bff] px-4 text-[13px] hover:bg-[#5851e5]"
          asChild
        >
          <Link href="/dashboard/books/new">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New book
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
              <Clapperboard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-white sm:text-[22px]">
                Turn book into movie with AI
              </h2>
              <p className="mt-1.5 max-w-[440px] text-[13px] leading-relaxed text-white/65">
                Adapt your manuscript into a screenplay, shot list, and scene
                breakdown — from page to screen in one workflow.
              </p>
            </div>
          </div>
          <Button
            className="h-9 shrink-0 rounded-md bg-white px-4 text-[13px] font-medium text-[#0a2540] hover:bg-white/90"
            asChild
          >
            <Link href="/dashboard/books/new">
              Get early access
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {onTrial && <DashboardTrialSection />}

      {/* Banners */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="relative overflow-hidden rounded-xl border border-[#e6ebf1] bg-[#f6f9fc] p-6">
          <div className="relative">
            <h2 className="max-w-[280px] text-[22px] font-semibold tracking-[-0.03em] text-[#0a2540]">
              Turn a premise into a full manuscript
            </h2>
            <p className="mt-2 max-w-[320px] text-[13px] leading-relaxed text-[#425466]">
              Outline, generate, and export books up to hundreds of pages —
              with your style and branding.
            </p>
            <Button
              className="mt-5 h-9 rounded-md bg-[#635bff] px-4 text-[13px] hover:bg-[#5851e5]"
              asChild
            >
              <Link href="/dashboard/books/new">
                Create a book
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        {user.plan === "FREE" && !onTrial ? (
          <DashboardUpgradeBanner pagesRemaining={pagesRemaining} />
        ) : onTrial ? (
          <div className="rounded-xl border border-[#f0e0a8] bg-[#fffbeb] p-6">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#9a6700]">
              Your plan
            </p>
            <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#0a2540]">
              Premium free trial
            </h2>
            <div className="mt-4 space-y-3">
              <div>
                <div className="flex justify-between text-[13px] text-[#425466]">
                  <span>Book generation</span>
                  <span>
                    {user.pagesUsed} / {user.pagesLimit} pages
                  </span>
                </div>
                <Progress value={usagePercent} className="mt-2 h-1.5" />
              </div>
              <div>
                <div className="flex justify-between text-[13px] text-[#425466]">
                  <span>Audiobook</span>
                  <span>
                    {user.audioMinutesUsed ?? 0} / {user.audioMinutesLimit ?? 0}{" "}
                    min
                  </span>
                </div>
                <Progress
                  value={
                    (user.audioMinutesLimit ?? 0) > 0
                      ? Math.round(
                          ((user.audioMinutesUsed ?? 0) /
                            (user.audioMinutesLimit ?? 1)) *
                            100
                        )
                      : 0
                  }
                  className="mt-2 h-1.5"
                />
              </div>
            </div>
            <Link
              href="/dashboard/billing"
              className="mt-4 inline-flex text-[13px] font-medium text-[#0e6245] hover:underline"
            >
              Unlock full Premium →
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-[#e6ebf1] bg-[#f6f9fc] p-6">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#697386]">
              Your plan
            </p>
            <h2 className="mt-2 text-[22px] font-semibold capitalize tracking-[-0.03em] text-[#0a2540]">
              {user.plan === "ENTERPRISE" ? "Premium" : user.plan.toLowerCase()}
            </h2>
            <div className="mt-4 space-y-3">
              <div>
                <div className="flex justify-between text-[13px] text-[#425466]">
                  <span>Book generation</span>
                  <span>
                    {user.pagesUsed} / {user.pagesLimit} pages
                  </span>
                </div>
                <Progress value={usagePercent} className="mt-2 h-1.5" />
              </div>
              <div>
                <div className="flex justify-between text-[13px] text-[#425466]">
                  <span>Audiobook</span>
                  <span>
                    {user.audioMinutesUsed ?? 0} / {user.audioMinutesLimit ?? 0}{" "}
                    min
                  </span>
                </div>
                <Progress
                  value={
                    (user.audioMinutesLimit ?? 0) > 0
                      ? Math.round(
                          ((user.audioMinutesUsed ?? 0) /
                            (user.audioMinutesLimit ?? 1)) *
                            100
                        )
                      : 0
                  }
                  className="mt-2 h-1.5"
                />
              </div>
            </div>
            <Link
              href="/dashboard/usage"
              className="mt-4 inline-flex text-[13px] font-medium text-[#635bff] hover:underline"
            >
              View usage details →
            </Link>
          </div>
        )}
      </div>

      {generating.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-medium text-[#0a2540]">
              Generating now
            </h2>
            <Link
              href="/dashboard/tracking"
              className="text-[13px] text-[#635bff] hover:underline"
            >
              Open tracking
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {generating.slice(0, 2).map((book) => (
              <Link
                key={book.id}
                href={`/dashboard/books/${book.id}`}
                className="rounded-lg border border-[#e6ebf1] bg-white p-4 hover:border-[#635bff]/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-medium text-[#0a2540]">
                      {book.title}
                    </p>
                    <p className="text-[12px] capitalize text-[#697386]">
                      {book.status.toLowerCase()} · {book.currentPages}/
                      {book.targetPages} pages
                    </p>
                  </div>
                  <span className="text-[13px] font-medium text-[#635bff]">
                    {Math.round(book.progress)}%
                  </span>
                </div>
                <Progress value={book.progress} className="mt-3 h-1.5" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent generated books */}
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
              : book.isSample
                ? `/dashboard/books/new?template=${sample.templateId}&title=${encodeURIComponent(book.title)}`
                : `/dashboard/books/new?title=${encodeURIComponent(book.title)}`;

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

      {/* User generated books */}
      <section>
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#0a2540]">
              Your books
            </h2>
            <p className="mt-1 text-[13px] text-[#697386]">
              {books.length === 0
                ? "Books you generate will appear here"
                : `${books.length} book${books.length === 1 ? "" : "s"} · ${completed.length} completed`}
            </p>
          </div>
          <Link
            href="/dashboard/books/new"
            className="inline-flex h-8 items-center rounded-md border border-[#e6ebf1] bg-white px-3 text-[13px] font-medium text-[#635bff] transition-colors hover:border-[#635bff]/30 hover:bg-[#f6f9fc]"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create new
          </Link>
        </div>

        {books.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#e6ebf1] px-6 py-14 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f0efff] text-[#635bff]">
              <BookOpen className="h-5 w-5" />
            </div>
            <p className="mt-4 text-[15px] font-medium text-[#0a2540]">
              No books generated yet
            </p>
            <p className="mt-1 text-[14px] text-[#697386]">
              Pick a recent cover above or start from a blank premise.
            </p>
            <Button
              className="mt-6 h-9 rounded-md bg-[#635bff] text-[13px] hover:bg-[#5851e5]"
              asChild
            >
              <Link href="/dashboard/books/new">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New book
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {books.map((book) => (
              <DashboardBookCard key={book.id} book={book} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
