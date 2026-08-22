import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ArrowRight,
  BookOpen,
  Clapperboard,
  Headphones,
  MicVocal,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DashboardUpgradeBanner } from "@/components/dashboard/dashboard-upgrade-banner";
import { DashboardTrialSection } from "@/components/dashboard/dashboard-trial-section";
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

  const justSignedUp =
    Date.now() - user.createdAt.getTime() < 15 * 60 * 1000;
  if (books.length === 0 && justSignedUp) {
    redirect("/dashboard/books/new");
  }

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
    <div className="space-y-8 lg:space-y-10">
      <div className="hidden items-start justify-between gap-4 lg:flex">
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

      <a
        href="https://litemoov.com"
        target="_blank"
        rel="noopener noreferrer"
        className="relative hidden overflow-hidden rounded-lg bg-[#0a2540] px-5 py-3 lg:block"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent, transparent 11px, #fff 11px, #fff 12px)",
          }}
        />
        <div className="absolute -right-12 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-[#635bff]/30 blur-2xl" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-white">
              <Clapperboard className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-white">
                Turn book into movie with AI
              </h2>
              <p className="mt-0.5 truncate text-[11px] text-white/60">
                Screenplay, shot list & scene breakdown — page to screen.
              </p>
            </div>
          </div>
          <span className="inline-flex h-7 shrink-0 items-center rounded-md bg-white px-3 text-[12px] font-medium text-[#0a2540]">
            Early access
            <ArrowRight className="ml-1 h-3 w-3" />
          </span>
        </div>
      </a>

      <div className="grid grid-cols-3 gap-2.5 lg:hidden">
        {(
          [
            {
              href: "/dashboard/books/new",
              label: "Book",
              hint: "Write",
              icon: BookOpen,
            },
            {
              href: "/dashboard/audio-studio",
              label: "Audiobook",
              hint: "Narrate",
              icon: Headphones,
            },
            {
              href: "/dashboard/songs",
              label: "Music",
              hint: "Song",
              icon: MicVocal,
            },
          ] as const
        ).map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="flex flex-col items-center rounded-2xl border border-[#e6ebf1] bg-white px-2 py-3.5 text-center shadow-[0_1px_2px_rgba(10,37,64,0.04)]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f0efff] text-[#635bff]">
              <card.icon className="h-4 w-4" />
            </span>
            <span className="mt-2 text-[13px] font-semibold text-[#0a2540]">
              {card.label}
            </span>
            <span className="mt-0.5 text-[11px] text-[#697386]">
              {card.hint}
            </span>
          </Link>
        ))}
      </div>

      {onTrial && <DashboardTrialSection />}

      {/* Banners */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="relative hidden overflow-hidden rounded-lg border border-[#e6ebf1] bg-[#f6f9fc] px-4 py-3.5 lg:block">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[#0a2540]">
                Turn a premise into a full manuscript
              </h2>
              <p className="mt-0.5 text-[12px] leading-snug text-[#697386]">
                Outline, generate, and export — with your style and branding.
              </p>
            </div>
            <Button
              className="h-7 shrink-0 rounded-md bg-[#635bff] px-3 text-[12px] hover:bg-[#5851e5]"
              asChild
            >
              <Link href="/dashboard/books/new">
                Create a book
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        </div>

        {user.plan === "FREE" && !onTrial ? (
          <DashboardUpgradeBanner pagesRemaining={pagesRemaining} />
        ) : onTrial ? (
          <div className="rounded-lg border border-[#f0e0a8] bg-[#fffbeb] px-4 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[#9a6700]">
                  Premium free trial
                </p>
                <p className="mt-0.5 text-[12px] text-[#425466]">
                  {user.pagesUsed}/{user.pagesLimit} pages ·{" "}
                  {user.audioMinutesUsed ?? 0}/{user.audioMinutesLimit ?? 0} min
                  audio
                </p>
              </div>
              <Link
                href="/dashboard/billing"
                className="shrink-0 text-[12px] font-medium text-[#0e6245] hover:underline"
              >
                Unlock Premium →
              </Link>
            </div>
            <Progress value={usagePercent} className="mt-2.5 h-1" />
          </div>
        ) : (
          <div className="rounded-lg border border-[#e6ebf1] bg-[#f6f9fc] px-4 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[#697386]">
                  Your plan ·{" "}
                  <span className="capitalize text-[#0a2540]">
                    {user.plan === "ENTERPRISE"
                      ? "Premium"
                      : user.plan.toLowerCase()}
                  </span>
                </p>
                <p className="mt-0.5 text-[12px] text-[#425466]">
                  {user.pagesUsed}/{user.pagesLimit} pages ·{" "}
                  {user.audioMinutesUsed ?? 0}/{user.audioMinutesLimit ?? 0} min
                  audio
                </p>
              </div>
              <Link
                href="/dashboard/usage"
                className="shrink-0 text-[12px] font-medium text-[#635bff] hover:underline"
              >
                Usage →
              </Link>
            </div>
            <Progress value={usagePercent} className="mt-2.5 h-1" />
          </div>
        )}
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
        <AnimatedCoverGrid covers={recentCovers} />
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
          <AnimatedBookGrid books={books} />
        )}
      </section>
    </div>
  );
}
