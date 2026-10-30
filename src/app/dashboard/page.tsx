import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BookOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DashboardCreatePrompt } from "@/components/dashboard/dashboard-create-prompt";
import {
  AnimatedBookGrid,
  AnimatedCoverGrid,
  AnimatedGeneratingList,
} from "@/components/dashboard/animated-book-grid";
import { PublicDashboardPreview } from "@/components/dashboard/public-preview";
import { getRecentLandingCovers } from "@/lib/landing-covers";
import { isTrialActive, syncUserTrialState } from "@/lib/billing";
import { AUDIO_STUDIO_GENRE } from "@/lib/audio-studio";
import { SONG_STUDIO_GENRE } from "@/lib/song-studio";
import { PLANS } from "@/lib/constants";

/** Books shown on the dashboard; the full list lives at /dashboard/books. */
const RECENT_BOOKS = 8;

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return <PublicDashboardPreview />;
  }

  const user = await syncUserTrialState(session.user.id);
  const onTrial = isTrialActive(user);

  // Writing projects only; audio and song studio drafts live in their studios.
  const bookWhere = {
    userId: session.user.id,
    NOT: { genre: { in: [AUDIO_STUDIO_GENRE, SONG_STUDIO_GENRE] } },
  };

  const [books, totalBooks, completedCount, generating, coverBooks, recentCovers] =
    await Promise.all([
      db.book.findMany({
        where: bookWhere,
        orderBy: { updatedAt: "desc" },
        take: RECENT_BOOKS,
        include: { _count: { select: { chapters: true } } },
      }),
      db.book.count({ where: bookWhere }),
      db.book.count({ where: { ...bookWhere, status: "COMPLETED" } }),
      db.book.findMany({
        where: { ...bookWhere, status: { in: ["GENERATING", "OUTLINING"] } },
        orderBy: { updatedAt: "desc" },
        take: 2,
      }),
      db.book.findMany({
        where: { ...bookWhere, coverImage: { not: null } },
        orderBy: { updatedAt: "desc" },
        take: 2,
      }),
      getRecentLandingCovers(4),
    ]);

  const pagesRemaining = Math.max(0, user.pagesLimit - user.pagesUsed);
  const usagePercent =
    user.pagesLimit > 0
      ? Math.round((user.pagesUsed / user.pagesLimit) * 100)
      : 0;

  // The author's own covers first, then their newest books without one.
  const userCoverBooks = [
    ...coverBooks,
    ...books.filter((b) => !coverBooks.some((c) => c.id === b.id)),
  ].slice(0, 2);
  const usingUserCovers = userCoverBooks.length > 0;
  const showcaseSource = usingUserCovers
    ? userCoverBooks
    : recentCovers.slice(0, 2);
  const showcaseCovers = showcaseSource.map((book) => ({
    id: book.id,
    title: book.title,
    genre: book.genre,
    coverImage: book.coverImage,
    href: usingUserCovers
      ? `/dashboard/books/${book.id}`
      : book.slug
        ? `/books/${book.slug}`
        : "/books",
  }));

  const latestBooks = (
    <section>
      <div className="mb-3 flex items-end justify-between gap-4">
        <h2 className="text-[15px] font-medium text-[#0a2540]">
          Latest books
        </h2>
        <Link
          href="/books"
          className="text-[13px] text-[#635bff] hover:underline"
        >
          Browse all
        </Link>
      </div>
      <AnimatedCoverGrid covers={recentCovers} />
    </section>
  );

  const yourBooks = (
    <section id="your-books" className="scroll-mt-20">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#0a2540]">
            Your books
          </h2>
          <p className="mt-1 text-[13px] text-[#697386]">
            {totalBooks === 0
              ? "Books you generate will appear here"
              : `${totalBooks} book${totalBooks === 1 ? "" : "s"} · ${completedCount} completed`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {totalBooks > RECENT_BOOKS && (
            <Link
              href="/dashboard/books"
              className="text-[13px] font-medium text-[#635bff] hover:underline"
            >
              View all {totalBooks}
            </Link>
          )}
          <Link
            href="/dashboard/books/new"
            className="inline-flex h-8 items-center rounded-full bg-[#f0efff] px-3.5 text-[13px] font-medium text-[#635bff] transition-colors hover:bg-[#e6e3ff]"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create new
          </Link>
        </div>
      </div>

      {totalBooks === 0 ? (
        <div className="rounded-3xl bg-[#f7f8fb] px-6 py-14 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f0efff] text-[#635bff]">
            <BookOpen className="h-5 w-5" />
          </div>
          <p className="mt-4 text-[15px] font-medium text-[#0a2540]">
            No books generated yet
          </p>
          <p className="mt-1 text-[14px] text-[#697386]">
            Use the prompt box above or start from a blank premise.
          </p>
          <Button
            className="mt-6 h-9 rounded-full bg-[#635bff] px-4 text-[13px] hover:bg-[#5851e5]"
            asChild
          >
            <Link href="/dashboard/books/new">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New book
            </Link>
          </Button>
        </div>
      ) : (
        <AnimatedBookGrid books={books} />
      )}
    </section>
  );

  return (
    <div className="space-y-8 lg:space-y-10">
      <DashboardCreatePrompt
        pagesRemaining={pagesRemaining}
        pagesLimit={user.pagesLimit}
        showcaseCovers={showcaseCovers}
      />

      <div
        className={
          onTrial
            ? "rounded-2xl bg-[#fff6d6] px-5 py-4"
            : "rounded-2xl bg-[#f6f9fc] px-5 py-4"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p
              className={
                onTrial
                  ? "text-[10px] font-medium uppercase tracking-wider text-[#9a6700]"
                  : "text-[10px] font-medium uppercase tracking-wider text-[#697386]"
              }
            >
              {onTrial ? (
                "Premium free trial"
              ) : (
                <>
                  Your plan ·{" "}
                  <span className="text-[#0a2540]">
                    {user.plan in PLANS
                      ? PLANS[user.plan as keyof typeof PLANS].name
                      : user.plan}
                  </span>
                </>
              )}
            </p>
            <p className="mt-0.5 text-[12px] text-[#425466]">
              {user.pagesUsed}/{user.pagesLimit} pages ·{" "}
              {user.audioMinutesUsed ?? 0}/{user.audioMinutesLimit ?? 0} min
              audio
            </p>
          </div>
          <Link
            href={onTrial ? "/dashboard/billing" : "/dashboard/usage"}
            className={
              onTrial
                ? "shrink-0 text-[12px] font-medium text-[#0e6245] hover:underline"
                : "shrink-0 text-[12px] font-medium text-[#635bff] hover:underline"
            }
          >
            {onTrial ? "Unlock Premium →" : "Usage →"}
          </Link>
        </div>
        <Progress value={usagePercent} className="mt-2.5 h-1" />
      </div>

      {generating.length > 0 && (
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-[#0a2540]">
              Generating now
            </h2>
            <Link
              href="/dashboard/tracking"
              className="text-[12px] text-[#635bff] hover:underline"
            >
              Open tracking
            </Link>
          </div>
          <AnimatedGeneratingList books={generating} />
        </section>
      )}

      {/* Returning authors see their own books first; new ones see
          what others have written before the empty state. */}
      {totalBooks > 0 ? (
        <>
          {yourBooks}
          {latestBooks}
        </>
      ) : (
        <>
          {latestBooks}
          {yourBooks}
        </>
      )}
    </div>
  );
}
