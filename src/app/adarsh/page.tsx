"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { BarChart, StackedSentiment, StatCard } from "@/components/admin/charts";
import { CountryFlag } from "@/components/admin/country-flag";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/admin-format";
import { cn } from "@/lib/utils";

type ClientCounts = {
  ios: number;
  android: number;
  web: number;
  unknown: number;
};

type InProgress = {
  total: number;
  queued: number;
  outlining: number;
  writing: number;
  noLiveJob: number;
  users: number;
  byUser: Array<{
    userId: string;
    email: string;
    name: string | null;
    count: number;
  }>;
  books: Array<{
    id: string;
    title: string;
    stage: "queued" | "outlining" | "writing";
    hasLiveJob: boolean;
    progress: number;
    currentPages: number;
    targetPages: number;
    createdVia: string;
    updatedAt: string;
    user: { id: string; email: string; name: string | null; plan: string };
  }>;
};

type Overview = {
  summary: {
    users: number;
    books: number;
    completedBooks: number;
    failedBooks: number;
    activeJobs: number;
    inProgressBooks: number;
    signups24h: number;
    signups7d: number;
    completionRate: number;
    failRate: number;
    avgScore: number;
    appBooks: number;
    webBooks: number;
    appBooks7d: number;
    webBooks7d: number;
    appJobs7d: number;
    webJobs7d: number;
  };
  clients: {
    booksAll: ClientCounts;
    books7d: ClientCounts;
    jobs7d: ClientCounts;
  };
  inProgress: InProgress;
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
    booksApp: number;
    booksWeb: number;
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
    countryCode?: string | null;
  }>;
  champions: Array<{
    userId: string;
    email: string;
    score: number;
    label: string;
    happy: string[];
    completed: number;
    countryCode?: string | null;
  }>;
  topImprovements: Array<{ text: string; count: number; source: string }>;
};

const severityColor: Record<string, string> = {
  high: "border-[#fde8e8] bg-[#fff5f5] text-[#df1b41]",
  medium: "border-[#fcf5e0] bg-[#fffbeb] text-[#9a6700]",
  low: "border-[#e6ebf1] bg-white text-[#425466]",
};

const stageStyle: Record<InProgress["books"][number]["stage"], string> = {
  queued: "bg-[#f0f3f7] text-[#697386]",
  outlining: "bg-[#ebe9ff] text-[#635bff]",
  writing: "bg-[#e8faf0] text-[#0e6245]",
};

const clientLabel: Record<string, string> = {
  ios: "iOS",
  android: "Android",
  web: "Web",
  unknown: "App",
};

async function fetchOverview(): Promise<
  { data: Overview; error?: undefined } | { data?: undefined; error: string }
> {
  try {
    const res = await fetch("/api/adarsh/overview");
    if (!res.ok) {
      return {
        error: res.status === 403 ? "Admin access required" : "Failed to load",
      };
    }
    return { data: (await res.json()) as Overview };
  } catch {
    return { error: "Failed to load" };
  }
}

export default function AdarshOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState(0);

  function apply(result: Awaited<ReturnType<typeof fetchOverview>>) {
    if (result.data) {
      setData(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
    setFetchedAt(Date.now());
    setLoading(false);
  }

  async function load() {
    setLoading(true);
    apply(await fetchOverview());
  }

  useEffect(() => {
    let cancelled = false;
    void fetchOverview().then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
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
        <StatCard
          label="Books in progress"
          value={s.inProgressBooks}
          hint={`${s.activeJobs} generation job${s.activeJobs === 1 ? "" : "s"} queued / running`}
        />
        <StatCard
          label="Avg sentiment"
          value={s.avgScore}
          hint="Higher = happier users"
        />
      </div>

      <InProgressSection data={data.inProgress} now={fetchedAt} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="App books"
          value={s.appBooks}
          hint={`${s.appBooks7d} created in last 7d`}
        />
        <StatCard
          label="Web books"
          value={s.webBooks}
          hint={`${s.webBooks7d} created in last 7d`}
        />
        <StatCard
          label="App jobs (7d)"
          value={s.appJobs7d}
          hint="Generation starts from mobile"
        />
        <StatCard
          label="Web jobs (7d)"
          value={s.webJobs7d}
          hint="Generation starts from web"
        />
      </div>

      <section className="rounded-xl border border-[#e6ebf1] bg-white p-4 sm:p-5">
        <h2 className="text-[14px] font-semibold">Clients</h2>
        <p className="mb-4 text-[12px] text-[#697386]">
          Books by create origin · jobs by who started generation (last 7 days)
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <ClientBreakdown
            title="Books (all time)"
            counts={data.clients.booksAll}
          />
          <ClientBreakdown
            title="Books (7d)"
            counts={data.clients.books7d}
          />
          <ClientBreakdown title="Jobs (7d)" counts={data.clients.jobs7d} />
        </div>
        <div className="mt-5">
          <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-[#a3acb9]">
            App book creates (14d)
          </h3>
          <BarChart data={data.daily} valueKey="booksApp" color="#0a2540" />
        </div>
      </section>

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
                  <p className="flex min-w-0 items-center gap-2 truncate text-[13px] font-medium">
                    <CountryFlag code={u.countryCode} showCode={false} />
                    <span className="truncate">{u.email}</span>
                  </p>
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
                <p className="flex min-w-0 items-center gap-2 truncate text-[13px] font-medium">
                  <CountryFlag code={u.countryCode} showCode={false} />
                  <span className="truncate">{u.email}</span>
                </p>
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

function InProgressSection({
  data,
  now,
}: {
  data: InProgress;
  now: number;
}) {
  const tiles: Array<{
    label: string;
    value: number;
    dot?: string;
    hint?: string;
    warn?: boolean;
  }> = [
    { label: "Queued", value: data.queued, dot: "#a3acb9", hint: "Waiting for a slot" },
    { label: "Outlining", value: data.outlining, dot: "#635bff", hint: "Planning chapters" },
    { label: "Writing", value: data.writing, dot: "#0e6245", hint: "Writing pages" },
    {
      label: "No live job",
      value: data.noLiveJob,
      hint: "Recovery will mark failed",
      warn: data.noLiveJob > 0,
    },
  ];

  return (
    <section className="rounded-xl border border-[#e6ebf1] bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold">In progress now</h2>
          <p className="text-[12px] text-[#697386]">
            Books outlining or writing right now
            {data.total > 0
              ? ` · ${data.users} user${data.users === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
        <Link href="/adarsh/books" className="text-[12px] text-[#635bff]">
          Generations
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="col-span-2 rounded-lg border border-[#e6ebf1] bg-[#f6f9fc] px-3 py-2.5 sm:col-span-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#a3acb9]">
            In progress
          </p>
          <p className="mt-0.5 text-[28px] font-semibold leading-tight tracking-[-0.03em] tabular-nums text-[#0a2540]">
            {data.total}
          </p>
        </div>
        {tiles.map((t) => (
          <div
            key={t.label}
            className={cn(
              "rounded-lg border px-3 py-2.5",
              t.warn
                ? "border-[#fcf5e0] bg-[#fffbeb]"
                : "border-[#e6ebf1]"
            )}
          >
            <div className="flex items-center gap-1.5">
              {t.dot ? (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: t.dot }}
                />
              ) : null}
              <span
                className={cn(
                  "text-[11px]",
                  t.warn ? "text-[#9a6700]" : "text-[#697386]"
                )}
              >
                {t.label}
              </span>
            </div>
            <p className="mt-1 text-[18px] font-semibold tabular-nums text-[#0a2540]">
              {t.value}
            </p>
            {t.hint ? (
              <p className="text-[11px] text-[#a3acb9]">{t.hint}</p>
            ) : null}
          </div>
        ))}
      </div>

      {data.total === 0 ? (
        <p className="mt-4 text-[13px] text-[#697386]">
          Nothing is generating right now.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[#a3acb9]">
              Books
              {data.total > data.books.length
                ? ` · latest ${data.books.length} of ${data.total}`
                : ""}
            </p>
            <ul className="divide-y divide-[#e6ebf1] rounded-lg border border-[#e6ebf1]">
              {data.books.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2"
                >
                  <div className="min-w-0 flex-1 basis-[200px]">
                    <Link
                      href={`/adarsh/books/${b.id}`}
                      className="block truncate text-[13px] font-medium text-[#0a2540] hover:text-[#635bff]"
                    >
                      {b.title || "Untitled"}
                    </Link>
                    <p className="truncate text-[11px] text-[#697386]">
                      {b.user.email} · {clientLabel[b.createdVia] ?? "Web"} ·{" "}
                      {b.user.plan}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                        stageStyle[b.stage]
                      )}
                    >
                      {b.stage}
                    </span>
                    {!b.hasLiveJob ? (
                      <span
                        className="inline-flex rounded-full bg-[#fcf5e0] px-2 py-0.5 text-[11px] font-medium text-[#9a6700]"
                        title="No queued or running generation job"
                      >
                        no live job
                      </span>
                    ) : null}
                  </div>
                  <div className="w-[120px]">
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f3f7]">
                      <div
                        className="h-full rounded-full bg-[#635bff]"
                        style={{
                          width: `${Math.min(100, Math.max(0, b.progress))}%`,
                        }}
                      />
                    </div>
                    <p className="mt-0.5 text-[11px] tabular-nums text-[#697386]">
                      {b.progress}% · {b.currentPages}/{b.targetPages}p
                    </p>
                  </div>
                  <span className="w-[64px] text-right text-[11px] text-[#a3acb9]">
                    {now ? timeAgo(b.updatedAt, now) : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[#a3acb9]">
              By user
            </p>
            <ul className="space-y-1.5">
              {data.byUser.map((u) => (
                <li
                  key={u.userId}
                  className="flex items-center justify-between gap-3 text-[13px]"
                >
                  <span className="min-w-0 truncate text-[#425466]" title={u.email}>
                    {u.name ? `${u.name} · ` : ""}
                    {u.email}
                  </span>
                  <span className="shrink-0 tabular-nums font-medium text-[#0a2540]">
                    {u.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function ClientBreakdown({
  title,
  counts,
}: {
  title: string;
  counts: ClientCounts;
}) {
  const rows: Array<{ key: keyof ClientCounts; label: string }> = [
    { key: "ios", label: "iOS" },
    { key: "android", label: "Android" },
    { key: "web", label: "Web" },
    { key: "unknown", label: "App (unspecified)" },
  ];
  const total = Math.max(
    1,
    counts.ios + counts.android + counts.web + counts.unknown
  );

  return (
    <div className="rounded-lg border border-[#e6ebf1] px-3 py-2.5">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[#a3acb9]">
        {title}
      </p>
      <ul className="space-y-1.5 text-[13px]">
        {rows.map(({ key, label }) => {
          const n = counts[key];
          if (!n && key === "unknown") return null;
          return (
            <li key={key} className="flex items-center justify-between gap-2">
              <span className="text-[#697386]">{label}</span>
              <span className="tabular-nums font-medium text-[#0a2540]">
                {n}
                <span className="ml-1.5 text-[11px] font-normal text-[#a3acb9]">
                  {Math.round((100 * n) / total)}%
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
