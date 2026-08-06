"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { BarChart, StackedSentiment, StatCard } from "@/components/admin/charts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Overview = {
  summary: {
    users: number;
    books: number;
    completedBooks: number;
    failedBooks: number;
    activeJobs: number;
    signups24h: number;
    signups7d: number;
    completionRate: number;
    failRate: number;
    avgScore: number;
  };
  sentiment: Record<string, number>;
  gaps: Array<{
    severity: string;
    area: string;
    finding: string;
    opportunity: string;
  }>;
  daily: Array<{
    date: string;
    jobs: number;
    completed: number;
    failed: number;
    signups: number;
    books: number;
  }>;
  bookStatus: Record<string, number>;
  plans: Record<string, number>;
  atRisk: Array<{
    userId: string;
    email: string;
    name: string | null;
    score: number;
    label: string;
    pain: string[];
    stuck: boolean;
    books: number;
    failed: number;
  }>;
  champions: Array<{
    userId: string;
    email: string;
    score: number;
    label: string;
    happy: string[];
    completed: number;
  }>;
  topImprovements: Array<{ text: string; count: number; source: string }>;
};

const severityColor: Record<string, string> = {
  high: "border-[#fde8e8] bg-[#fff5f5] text-[#df1b41]",
  medium: "border-[#fcf5e0] bg-[#fffbeb] text-[#9a6700]",
  low: "border-[#e6ebf1] bg-white text-[#425466]",
};

export default function AdarshOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/adarsh/overview");
    if (!res.ok) {
      setError(res.status === 403 ? "Admin access required" : "Failed to load");
      setLoading(false);
      return;
    }
    setData(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[#635bff]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-[#fde8e8] bg-white p-6 text-[#df1b41]">
        {error ?? "No data"}
      </div>
    );
  }

  const s = data.summary;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.03em]">
            Product pulse
          </h1>
          <p className="text-[13px] text-[#697386]">
            Happiness, friction, and generation health across all users
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={s.users} hint={`+${s.signups7d} this week`} />
        <StatCard
          label="Books"
          value={s.books}
          hint={`${s.completionRate}% complete · ${s.failRate}% failed`}
        />
        <StatCard label="Active jobs" value={s.activeJobs} hint="Queued / running" />
        <StatCard
          label="Avg sentiment"
          value={s.avgScore}
          hint="Higher = happier users"
        />
      </div>

      <section className="rounded-xl border border-[#e6ebf1] bg-white p-4 sm:p-5">
        <h2 className="text-[14px] font-semibold">Where users feel</h2>
        <p className="mb-4 text-[12px] text-[#697386]">
          Scored from completions, failures, limits, inactivity, trials & audio
        </p>
        <StackedSentiment sentiment={data.sentiment} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-[#e6ebf1] bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-[14px] font-semibold">Jobs (14 days)</h2>
          <BarChart data={data.daily} valueKey="jobs" color="#635bff" />
          <div className="mt-3 flex gap-4 text-[11px] text-[#697386]">
            <span>Completed peak: {Math.max(...data.daily.map((d) => d.completed), 0)}</span>
            <span>Failed peak: {Math.max(...data.daily.map((d) => d.failed), 0)}</span>
          </div>
        </section>
        <section className="rounded-xl border border-[#e6ebf1] bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-[14px] font-semibold">Signups (14 days)</h2>
          <BarChart data={data.daily} valueKey="signups" color="#0a2540" />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-[#e6ebf1] bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-[14px] font-semibold">What to improve</h2>
          <ul className="space-y-2">
            {data.gaps.length === 0 && (
              <li className="text-[13px] text-[#697386]">No major product gaps flagged.</li>
            )}
            {data.gaps.map((g) => (
              <li
                key={g.area + g.finding}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-[13px]",
                  severityColor[g.severity] ?? severityColor.low
                )}
              >
                <p className="font-medium">
                  {g.area} · {g.severity}
                </p>
                <p className="mt-0.5 opacity-90">{g.finding}</p>
                <p className="mt-1 text-[12px] opacity-80">→ {g.opportunity}</p>
              </li>
            ))}
          </ul>
          {data.topImprovements.length > 0 && (
            <div className="mt-4 border-t border-[#e6ebf1] pt-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[#a3acb9]">
                Recurring user-level fixes
              </p>
              <ul className="space-y-1.5">
                {data.topImprovements.slice(0, 6).map((t) => (
                  <li key={t.text} className="flex justify-between gap-3 text-[12px]">
                    <span className="text-[#425466]">{t.text}</span>
                    <span className="shrink-0 tabular-nums text-[#a3acb9]">
                      {t.source === "product" ? "gap" : `×${t.count}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#e6ebf1] bg-white p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">At-risk users</h2>
            <Link href="/adarsh/users" className="text-[12px] text-[#635bff]">
              All users
            </Link>
          </div>
          <ul className="space-y-2">
            {data.atRisk.length === 0 && (
              <li className="text-[13px] text-[#697386]">Nobody flagged right now.</li>
            )}
            {data.atRisk.slice(0, 8).map((u) => (
              <li
                key={u.userId}
                className="rounded-lg border border-[#e6ebf1] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[13px] font-medium">{u.email}</p>
                  <span className="text-[11px] tabular-nums text-[#df1b41]">
                    {u.score}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] capitalize text-[#697386]">
                  {u.label}
                  {u.stuck ? " · stuck" : ""} · {u.failed} failed / {u.books} books
                </p>
                {u.pain[0] && (
                  <p className="mt-1 text-[12px] text-[#425466]">{u.pain[0]}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-[#e6ebf1] bg-white p-4 sm:p-5">
        <h2 className="mb-3 text-[14px] font-semibold">Happy / champions</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.champions.map((u) => (
            <div
              key={u.userId}
              className="rounded-lg border border-[#cbf4c9]/60 bg-[#f6fff8] px-3 py-2"
            >
              <div className="flex justify-between gap-2">
                <p className="truncate text-[13px] font-medium">{u.email}</p>
                <span className="text-[11px] tabular-nums text-[#0e6245]">
                  +{u.score}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-[#697386]">
                {u.completed} completed · {u.label}
              </p>
              {u.happy[0] && (
                <p className="mt-1 text-[12px] text-[#0e6245]">{u.happy[0]}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-[#e6ebf1] bg-white p-4">
          <h2 className="mb-2 text-[14px] font-semibold">Book status</h2>
          <ul className="space-y-1 text-[13px]">
            {Object.entries(data.bookStatus).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span className="text-[#697386]">{k}</span>
                <span className="tabular-nums font-medium">{v}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-[#e6ebf1] bg-white p-4">
          <h2 className="mb-2 text-[14px] font-semibold">Plans</h2>
          <ul className="space-y-1 text-[13px]">
            {Object.entries(data.plans).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span className="text-[#697386]">{k}</span>
                <span className="tabular-nums font-medium">{v}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
