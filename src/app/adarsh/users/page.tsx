"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDate, formatDaysAgo } from "@/lib/admin-format";
import { CountryFlag } from "@/components/admin/country-flag";

type PaidStatus =
  | "paying"
  | "stripe_trial"
  | "trial"
  | "trial_ended"
  | "comped"
  | "free";

type UserRow = {
  userId: string;
  email: string;
  name: string | null;
  authorName: string | null;
  plan: string;
  paidStatus: PaidStatus;
  trialEndsAt: string | null;
  hasStripe: boolean;
  score: number;
  label: string;
  happy: string[];
  pain: string[];
  improvements: string[];
  books: number;
  completed: number;
  failed: number;
  inProgress: number;
  studioDrafts: number;
  pagesUsed: number;
  pagesLimit: number;
  pagesBonus: number;
  audioMinutesUsed: number;
  audioMinutesLimit: number;
  createdAt: string;
  daysSinceSignup: number;
  daysSinceActive: number;
  stuck: boolean;
  countryCode: string | null;
  pushTokens: number;
  signupVia: "phone" | "pc" | "unknown";
  signupViaGuessed: boolean;
};

type UsersResponse = {
  users: UserRow[];
  total: number;
  page: number;
  pageSize: number;
};

const sorts = [
  ["newest", "Newest first"],
  ["oldest", "Oldest first"],
  ["pages", "Most pages used"],
] as const;

const paidFilters = [
  ["all", "All users"],
  ["paying", "Paying"],
  ["trial", "On trial"],
  ["comped", "Comped"],
  ["free", "Free"],
] as const;

const plans = ["FREE", "PRO", "ENTERPRISE", "UNLIMITED"];

const paidBadge: Record<
  PaidStatus,
  { label: string; className: string; title: string }
> = {
  paying: {
    label: "Paying",
    className: "bg-[#cbf4c9] text-[#0e6245]",
    title: "Active Stripe subscription",
  },
  stripe_trial: {
    label: "Trial · card",
    className: "bg-[#e8faf0] text-[#0e6245]",
    title: "Stripe subscription in its trial period",
  },
  trial: {
    label: "Free trial",
    className: "bg-[#ebe9ff] text-[#635bff]",
    title: "Premium trial, no card on file",
  },
  trial_ended: {
    label: "Trial ended",
    className: "bg-[#fcf5e0] text-[#9a6700]",
    title: "Trial is over; drops to Free on their next visit",
  },
  comped: {
    label: "Comped",
    className: "bg-[#e8f0fe] text-[#0a2540]",
    title: "Paid plan granted without a Stripe subscription",
  },
  free: {
    label: "Free",
    className: "bg-[#f0f3f7] text-[#697386]",
    title: "Not paying",
  },
};

const labelStyle: Record<string, string> = {
  delighted: "bg-[#cbf4c9] text-[#0e6245]",
  happy: "bg-[#e8faf0] text-[#0e6245]",
  neutral: "bg-[#f0f3f7] text-[#697386]",
  frustrated: "bg-[#fcf5e0] text-[#9a6700]",
  churning: "bg-[#fde8e8] text-[#df1b41]",
};

const signupStyle: Record<UserRow["signupVia"], string> = {
  phone: "bg-[#ebe9ff] text-[#635bff]",
  pc: "bg-[#e8f0fe] text-[#0a2540]",
  unknown: "bg-[#f0f3f7] text-[#697386]",
};

const signupLabel: Record<UserRow["signupVia"], string> = {
  phone: "Phone",
  pc: "PC",
  unknown: "Unknown",
};

async function fetchUsers(
  query: string
): Promise<{ data?: UsersResponse; error?: string }> {
  try {
    const res = await fetch(`/api/adarsh/users?${query}`);
    if (!res.ok) {
      return {
        error:
          res.status === 403 ? "Admin access required" : "Failed to load users",
      };
    }
    return { data: (await res.json()) as UsersResponse };
  } catch {
    return { error: "Failed to load users" };
  }
}

export default function AdarshUsersPage() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [paid, setPaid] = useState("all");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{
    query: string;
    data?: UsersResponse;
    error?: string;
  } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const query = new URLSearchParams({
    page: String(page),
    sort,
    paid,
    ...(q ? { q } : {}),
  }).toString();
  const loading = result?.query !== query;

  useEffect(() => {
    let cancelled = false;
    void fetchUsers(query).then((r) => {
      if (!cancelled) setResult({ query, ...r });
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  async function updatePlan(userId: string, plan: string) {
    setSaving(userId);
    setPlanError(null);
    const res = await fetch("/api/adarsh/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, plan }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setPlanError(body?.error || `Could not set plan to ${plan}`);
    }
    setResult({ query, ...(await fetchUsers(query)) });
    setSaving(null);
  }

  const data = result?.data;
  const users = data?.users ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const firstRow = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastRow = data ? firstRow + users.length - (users.length ? 1 : 0) : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.03em]">
          User management
        </h1>
        <p className="text-[13px] text-[#697386]">
          Who signed up, what they pay, what they wrote, and plan controls
        </p>
        {planError && (
          <p className="mt-2 text-[13px] text-[#df1b41]">{planError}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <form
          className="flex min-w-[260px] flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(input.trim());
            setPage(1);
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a3acb9]" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search email, name, user ID, or country code…"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Select
          value={paid}
          onValueChange={(v) => {
            setPaid(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[140px]" aria-label="Paid status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {paidFilters.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(v) => {
            setSort(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[160px]" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sorts.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!result ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#635bff]" />
        </div>
      ) : result.error && !data ? (
        <div className="rounded-xl border border-[#fde8e8] bg-white p-6 text-[13px] text-[#df1b41]">
          {result.error}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 text-[12px] text-[#697386]">
            <span className="flex items-center gap-2">
              {data && data.total > 0
                ? `Showing ${firstRow.toLocaleString()}–${lastRow.toLocaleString()} of ${data.total.toLocaleString()} users`
                : "No users match"}
              {q ? ` for “${q}”` : ""}
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#635bff]" />
              ) : null}
            </span>
            <Pager
              page={page}
              totalPages={totalPages}
              disabled={loading}
              onPage={setPage}
            />
          </div>

          <div
            className={cn(
              "overflow-hidden rounded-xl border border-[#e6ebf1] bg-white transition-opacity",
              loading && "opacity-60"
            )}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-[13px]">
                <thead className="border-b border-[#e6ebf1] bg-[#f6f9fc] text-[11px] uppercase tracking-wider text-[#a3acb9]">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">User</th>
                    <th className="px-3 py-2.5 font-medium">Plan</th>
                    <th className="px-3 py-2.5 font-medium">Signed up</th>
                    <th className="px-3 py-2.5 font-medium">Books</th>
                    <th className="px-3 py-2.5 font-medium">Pages used</th>
                    <th className="px-3 py-2.5 font-medium">Active</th>
                    <th className="px-3 py-2.5 font-medium">Sentiment</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-8 text-center text-[13px] text-[#697386]"
                      >
                        No users on this page.
                      </td>
                    </tr>
                  )}
                  {users.map((u) => (
                    <Fragment key={u.userId}>
                      <tr
                        className="cursor-pointer border-b border-[#e6ebf1] align-top hover:bg-[#fafbff]"
                        onClick={() =>
                          setExpanded(expanded === u.userId ? null : u.userId)
                        }
                      >
                        <td className="max-w-[280px] px-3 py-2.5">
                          <div className="flex min-w-0 items-center gap-2">
                            {u.countryCode ? (
                              <CountryFlag
                                code={u.countryCode}
                                showCode={false}
                              />
                            ) : null}
                            {u.name ? (
                              <p className="truncate font-medium text-[#0a2540]">
                                {u.name}
                              </p>
                            ) : (
                              <p className="truncate italic text-[#a3acb9]">
                                No name
                              </p>
                            )}
                          </div>
                          <p
                            className="truncate text-[12px] text-[#425466]"
                            title={u.email}
                          >
                            {u.email}
                          </p>
                          {u.stuck ? (
                            <span className="mt-1 inline-flex rounded-full bg-[#fcf5e0] px-1.5 py-0.5 text-[10px] font-medium text-[#9a6700]">
                              stuck
                            </span>
                          ) : null}
                        </td>
                        <td
                          className="px-3 py-2.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Select
                            value={u.plan}
                            onValueChange={(v) => void updatePlan(u.userId, v)}
                            disabled={saving === u.userId}
                          >
                            <SelectTrigger className="h-8 w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {plans.map((p) => (
                                <SelectItem key={p} value={p}>
                                  {p}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                                paidBadge[u.paidStatus].className
                              )}
                              title={paidBadge[u.paidStatus].title}
                            >
                              {paidBadge[u.paidStatus].label}
                            </span>
                            {u.trialEndsAt &&
                            (u.paidStatus === "trial" ||
                              u.paidStatus === "stripe_trial") ? (
                              <span className="text-[11px] text-[#697386]">
                                ends {formatDate(u.trialEndsAt)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="whitespace-nowrap text-[#0a2540]">
                            {formatDate(u.createdAt)}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#697386]">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                signupStyle[u.signupVia]
                              )}
                              title={
                                u.signupViaGuessed
                                  ? "Inferred from devices and first book"
                                  : "Recorded at signup"
                              }
                            >
                              {signupLabel[u.signupVia]}
                              {u.signupViaGuessed ? "?" : ""}
                            </span>
                            {formatDaysAgo(u.daysSinceSignup)}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          <p className="font-medium text-[#0a2540]">
                            {u.books}
                          </p>
                          <p className="text-[11px] text-[#697386]">
                            <BookBreakdown user={u} />
                          </p>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          <PagesUsed user={u} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[#697386]">
                          {formatDaysAgo(u.daysSinceActive)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                              labelStyle[u.label] ?? labelStyle.neutral
                            )}
                          >
                            {u.label} · {u.score}
                          </span>
                        </td>
                      </tr>
                      {expanded === u.userId && (
                        <tr className="border-b border-[#e6ebf1] bg-[#fafbff]">
                          <td colSpan={7} className="px-4 py-3">
                            <UserDetails user={u} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 ? (
            <div className="flex justify-end">
              <Pager
                page={page}
                totalPages={totalPages}
                disabled={loading}
                onPage={setPage}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function Pager({
  page,
  totalPages,
  disabled,
  onPage,
}: {
  page: number;
  totalPages: number;
  disabled: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <span className="tabular-nums text-[12px] text-[#697386]">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || page >= totalPages}
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function BookBreakdown({ user: u }: { user: UserRow }) {
  if (u.books === 0) return <>none yet</>;
  const parts = [
    u.completed > 0 ? `${u.completed} done` : null,
    u.inProgress > 0 ? `${u.inProgress} in progress` : null,
  ].filter(Boolean);
  return (
    <>
      {parts.join(" · ") || "none finished"}
      {u.failed > 0 ? (
        <span className="text-[#df1b41]">
          {parts.length ? " · " : ", "}
          {u.failed} failed
        </span>
      ) : null}
    </>
  );
}

function PagesUsed({ user: u }: { user: UserRow }) {
  const pct =
    u.pagesLimit > 0 ? Math.min(100, (100 * u.pagesUsed) / u.pagesLimit) : 0;
  return (
    <div className="w-[130px]">
      <p className="text-[#0a2540]">
        {u.pagesUsed.toLocaleString()}
        <span className="text-[#a3acb9]"> / {u.pagesLimit.toLocaleString()}</span>
      </p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f0f3f7]">
        <div
          className={cn(
            "h-full rounded-full",
            pct >= 100 ? "bg-[#df1b41]" : pct >= 85 ? "bg-[#f5a623]" : "bg-[#635bff]"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {u.pagesBonus > 0 ? (
        <p className="mt-0.5 text-[11px] text-[#697386]">
          incl. +{u.pagesBonus.toLocaleString()} add-on
        </p>
      ) : null}
    </div>
  );
}

function UserDetails({ user: u }: { user: UserRow }) {
  const facts: Array<[string, React.ReactNode]> = [
    ["User ID", <span key="id" className="select-all font-mono text-[11px]">{u.userId}</span>],
    ["Country", <CountryFlag key="cc" code={u.countryCode} />],
    ["Author name", u.authorName || "—"],
    ["Stripe customer", u.hasStripe ? "Yes" : "No"],
    [
      "Audio minutes",
      `${u.audioMinutesUsed.toLocaleString()} / ${u.audioMinutesLimit.toLocaleString()}`,
    ],
    ["Push devices", u.pushTokens],
    ["Studio drafts", u.studioDrafts],
  ];

  return (
    <div className="space-y-3">
      <dl className="grid gap-x-6 gap-y-2 text-[12px] sm:grid-cols-3 lg:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wider text-[#a3acb9]">
              {label}
            </dt>
            <dd className="truncate text-[#425466]">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-3 border-t border-[#e6ebf1] pt-3 sm:grid-cols-3">
        <InsightList title="Happy" tone="text-[#0e6245]" items={u.happy} />
        <InsightList title="Disappointed" tone="text-[#df1b41]" items={u.pain} />
        <InsightList title="Improve" tone="text-[#635bff]" items={u.improvements} />
      </div>
    </div>
  );
}

function InsightList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: string;
  items: string[];
}) {
  return (
    <div>
      <p className={cn("text-[11px] font-medium uppercase", tone)}>{title}</p>
      <ul className="mt-1 space-y-0.5 text-[12px] text-[#425466]">
        {items.length === 0 && <li>—</li>}
        {items.map((h) => (
          <li key={h}>• {h}</li>
        ))}
      </ul>
    </div>
  );
}
