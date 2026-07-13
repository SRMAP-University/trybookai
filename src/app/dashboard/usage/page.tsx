"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PLANS, PREMIUM_TRIAL } from "@/lib/constants";
import {
  formatTrialCountdown,
  TrialBanner,
} from "@/components/dashboard/trial-banner";
import { AnonymousRouteFallback } from "@/components/dashboard/anonymous-route-fallback";

type Analytics = {
  user: {
    plan: "FREE" | "PRO" | "ENTERPRISE";
    pagesUsed: number;
    pagesLimit: number;
    audioMinutesUsed: number;
    audioMinutesLimit: number;
    onTrial?: boolean;
    trialEndsAt?: string | null;
  };
  summary: {
    totalBooks: number;
    completedBooks: number;
    totalPagesGenerated: number;
    pagesUsed: number;
    pagesLimit: number;
    pagesRemaining: number;
    usagePercent: number;
    audioMinutesUsed: number;
    audioMinutesLimit: number;
    audioMinutesRemaining: number;
    audioUsagePercent: number;
    completedChapters: number;
    totalChapters: number;
    statusCounts: Record<string, number>;
    genreBreakdown: Record<string, number>;
  };
  dailyActivity: {
    date: string;
    jobs: number;
    completed: number;
    failed: number;
  }[];
  books: {
    id: string;
    title: string;
    currentPages: number;
    targetPages: number;
    status: string;
    genre: string | null;
  }[];
};

function UsagePageContent() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/analytics")
      .then(async (res) => {
        const text = await res.text();
        let json: (Analytics & { error?: string }) | null = null;
        if (text) {
          try {
            json = JSON.parse(text) as Analytics & { error?: string };
          } catch {
            throw new Error("Invalid response from analytics API");
          }
        }
        if (!res.ok) {
          throw new Error(json?.error || `Failed to load usage (${res.status})`);
        }
        if (!json || !json.summary) {
          throw new Error("Analytics data missing");
        }
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load usage");
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[#635bff]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-16 text-center">
        <p className="text-[14px] text-[#df1b41]">
          {error ?? "Could not load usage"}
        </p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => window.location.reload()}
        >
          Retry
        </Button>
      </div>
    );
  }

  const maxJobs = Math.max(...data.dailyActivity.map((d) => d.jobs), 1);
  const plan = PLANS[data.user.plan];
  const topBooks = [...data.books]
    .sort((a, b) => b.currentPages - a.currentPages)
    .slice(0, 5);
  const genres = Object.entries(data.summary.genreBreakdown).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            Usage
          </h1>
          <p className="mt-1 text-[14px] text-[#697386]">
            Page credits, generation volume, and plan utilization.
          </p>
        </div>
        <Button
          className="h-9 rounded-md bg-[#635bff] text-[13px] hover:bg-[#5851e5]"
          asChild
        >
          <Link href="/dashboard/billing">Manage plan</Link>
        </Button>
      </div>

      {data.user.onTrial && (
        <div className="mt-6">
          <TrialBanner
            trialEndsAt={data.user.trialEndsAt}
            pagesUsed={data.summary.pagesUsed}
            pagesLimit={data.summary.pagesLimit}
            audioMinutesUsed={data.summary.audioMinutesUsed}
            audioMinutesLimit={data.summary.audioMinutesLimit}
          />
        </div>
      )}

      <div className="mt-8 rounded-lg border border-[#e6ebf1] bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wider text-[#697386]">
              Monthly page credits
            </p>
            <p className="mt-1 text-[32px] font-semibold tracking-[-0.03em] text-[#0a2540]">
              {data.summary.pagesUsed.toLocaleString()}
              <span className="text-[18px] font-medium text-[#697386]">
                {" "}
                / {data.summary.pagesLimit.toLocaleString()}
              </span>
            </p>
            <p className="mt-1 text-[13px] text-[#697386]">
              {data.summary.pagesRemaining.toLocaleString()} remaining ·{" "}
              {data.user.onTrial ? (
                <>
                  <span className="font-medium text-[#9a6700]">
                    Premium free trial
                  </span>
                  {data.user.trialEndsAt && (
                    <> · {formatTrialCountdown(data.user.trialEndsAt)}</>
                  )}
                  {" · "}
                  {PREMIUM_TRIAL.pagesLimit.toLocaleString()} pages ·{" "}
                  {Math.round(PREMIUM_TRIAL.audioMinutesLimit / 60)} hours audio
                </>
              ) : (
                <>
                  <span className="capitalize">
                    {data.user.plan === "ENTERPRISE"
                      ? "Premium"
                      : data.user.plan.toLowerCase()}
                  </span>{" "}
                  plan
                  {data.user.plan !== "FREE" && ` ($${plan.price}/mo)`}
                </>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[28px] font-semibold text-[#635bff]">
              {data.summary.usagePercent}%
            </p>
            <p className="text-[12px] text-[#697386]">used this cycle</p>
          </div>
        </div>
        <Progress value={data.summary.usagePercent} className="mt-5 h-2" />
      </div>

      <div className="mt-6 rounded-lg border border-[#e6ebf1] bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wider text-[#697386]">
              Monthly audiobook time
            </p>
            <p className="mt-1 text-[32px] font-semibold tracking-[-0.03em] text-[#0a2540]">
              {data.summary.audioMinutesUsed}
              <span className="text-[18px] font-medium text-[#697386]">
                {" "}
                / {data.summary.audioMinutesLimit} min
              </span>
            </p>
            <p className="mt-1 text-[13px] text-[#697386]">
              {data.summary.audioMinutesRemaining} min remaining ·{" "}
              {data.user.onTrial
                ? `${Math.round(PREMIUM_TRIAL.audioMinutesLimit / 60)} hours on trial`
                : data.user.plan === "PRO"
                  ? "1 hour included"
                  : data.user.plan === "ENTERPRISE"
                    ? "3 hours included"
                    : "Upgrade for narration"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[28px] font-semibold text-[#0e6245]">
              {data.summary.audioUsagePercent}%
            </p>
            <p className="text-[12px] text-[#697386]">audio used</p>
          </div>
        </div>
        <Progress
          value={data.summary.audioUsagePercent}
          className="mt-5 h-2"
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#e6ebf1] bg-[#e6ebf1] lg:grid-cols-4">
        {[
          {
            label: "Pages generated",
            value: data.summary.totalPagesGenerated.toLocaleString(),
          },
          {
            label: "Books",
            value: data.summary.totalBooks.toLocaleString(),
          },
          {
            label: "Completed",
            value: data.summary.completedBooks.toLocaleString(),
          },
          {
            label: "Chapters done",
            value: `${data.summary.completedChapters}/${data.summary.totalChapters}`,
          },
        ].map((item) => (
          <div key={item.label} className="bg-white px-5 py-4">
            <p className="text-[12px] font-medium uppercase tracking-wider text-[#697386]">
              {item.label}
            </p>
            <p className="mt-1 text-[22px] font-semibold text-[#0a2540]">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-[#e6ebf1] bg-white p-5">
          <h2 className="text-[15px] font-medium text-[#0a2540]">
            Activity · last 14 days
          </h2>
          <div className="mt-6 flex h-40 items-end gap-1.5">
            {data.dailyActivity.map((day) => (
              <div
                key={day.date}
                className="group relative flex flex-1 flex-col items-center justify-end"
              >
                <div
                  className="w-full rounded-t bg-[#635bff]/80 transition-colors group-hover:bg-[#635bff]"
                  style={{
                    height: `${Math.max(4, (day.jobs / maxJobs) * 100)}%`,
                  }}
                  title={`${day.date}: ${day.jobs} jobs`}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-[#a3acb9]">
            <span>{data.dailyActivity[0]?.date.slice(5)}</span>
            <span>
              {data.dailyActivity[data.dailyActivity.length - 1]?.date.slice(5)}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-[#e6ebf1] bg-white p-5">
          <h2 className="text-[15px] font-medium text-[#0a2540]">
            Status breakdown
          </h2>
          <div className="mt-4 space-y-3">
            {Object.entries(data.summary.statusCounts).length === 0 ? (
              <p className="text-[14px] text-[#697386]">No books yet.</p>
            ) : (
              Object.entries(data.summary.statusCounts).map(([status, count]) => {
                const pct =
                  data.summary.totalBooks > 0
                    ? Math.round((count / data.summary.totalBooks) * 100)
                    : 0;
                return (
                  <div key={status}>
                    <div className="mb-1 flex justify-between text-[13px]">
                      <span className="capitalize text-[#425466]">
                        {status.toLowerCase()}
                      </span>
                      <span className="text-[#697386]">
                        {count} · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#e6ebf1]">
                      <div
                        className="h-full rounded-full bg-[#635bff]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-[#e6ebf1] bg-white p-5">
          <h2 className="text-[15px] font-medium text-[#0a2540]">
            Top books by pages
          </h2>
          <div className="mt-4 divide-y divide-[#e6ebf1]">
            {topBooks.length === 0 ? (
              <p className="py-6 text-[14px] text-[#697386]">No books yet.</p>
            ) : (
              topBooks.map((book) => (
                <Link
                  key={book.id}
                  href={`/dashboard/books/${book.id}`}
                  className="flex items-center justify-between py-3 hover:bg-[#f6f9fc]"
                >
                  <div>
                    <p className="text-[14px] font-medium text-[#635bff]">
                      {book.title}
                    </p>
                    <p className="text-[12px] text-[#697386]">
                      {book.genre ?? "—"} · {book.status.toLowerCase()}
                    </p>
                  </div>
                  <p className="text-[13px] text-[#0a2540]">
                    {book.currentPages} pages
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-[#e6ebf1] bg-white p-5">
          <h2 className="text-[15px] font-medium text-[#0a2540]">
            Genre mix
          </h2>
          <div className="mt-4 space-y-3">
            {genres.length === 0 ? (
              <p className="text-[14px] text-[#697386]">No genre data yet.</p>
            ) : (
              genres.map(([genre, count]) => (
                <div
                  key={genre}
                  className="flex items-center justify-between text-[14px]"
                >
                  <span className="text-[#425466]">{genre}</span>
                  <span className="font-medium text-[#0a2540]">{count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UsagePage() {
  return (
    <AnonymousRouteFallback
      title="Usage"
      description="Review page credits, audio minutes, and generation activity."
    >
      <UsagePageContent />
    </AnonymousRouteFallback>
  );
}
