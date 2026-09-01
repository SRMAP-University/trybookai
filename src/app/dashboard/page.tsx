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
      NOT: { genre: { in: [AUDIO_STUDIO_GENRE, SONG_STUDIO_GENRE] } },
    },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { chapters: true } } },
  });

  const recentCovers = await getRecentLandingCovers(4);

  const pagesRemaining = Math.max(0, user.pagesLimit - user.pagesUsed);
  const usagePercent =
    user.pagesLimit > 0
      ? Math.round((user.pagesUsed / user.pagesLimit) * 100)
      : 0;
  const generating = books.filter(
    (b) => b.status === "GENERATING" || b.status === "OUTLINING"
  );
  const completed = books.filter((b) => b.status === "COMPLETED");
  const firstName = user.name?.split(" ")[0];

  const userCoverBooks = books
    .slice()
    .sort((a, b) => Number(Boolean(b.coverImage)) - Number(Boolean(a.coverImage)))
    .slice(0, 2);
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

  return (
    <div className="space-y-8 lg:space-y-10">
      <DashboardCreatePrompt
        pagesRemaining={pagesRemaining}
        pagesLimit={user.pagesLimit}
        firstName={firstName}
        showcaseCovers={showcaseCovers}
      />

      <div
        className={
          onTrial
            ? "rounded-lg border border-[#f0e0a8] bg-[#fffbeb] px-4 py-3.5"
            : "rounded-lg border border-[#e6ebf1] bg-[#f6f9fc] px-4 py-3.5"
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
                  <span className="capitalize text-[#0a2540]">
                    {user.plan === "ENTERPRISE"
                      ? "Premium"
                      : user.plan.toLowerCase()}
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
          <AnimatedGeneratingList books={generating.slice(0, 2)} />
        </section>
      )}

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
        <AnimatedCoverGrid covers={recentCovers} />
      </section>

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
              Use the prompt box above or start from a blank premise.
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
          <AnimatedBookGrid books={books} />
        )}
      </section>
    </div>
  );
}
