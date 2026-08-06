"use client";

import { Fragment, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
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

type UserRow = {
  userId: string;
  email: string;
  name: string | null;
  plan: string;
  score: number;
  label: string;
  happy: string[];
  pain: string[];
  improvements: string[];
  books: number;
  completed: number;
  failed: number;
  pagesUsed: number;
  pagesLimit: number;
  daysSinceActive: number;
  stuck: boolean;
  onTrial: boolean;
  hasSub: boolean;
  audioMinutesUsed: number;
  audioMinutesLimit: number;
};

const labelStyle: Record<string, string> = {
  delighted: "bg-[#cbf4c9] text-[#0e6245]",
  happy: "bg-[#e8faf0] text-[#0e6245]",
  neutral: "bg-[#f0f3f7] text-[#697386]",
  frustrated: "bg-[#fcf5e0] text-[#9a6700]",
  churning: "bg-[#fde8e8] text-[#df1b41]",
};

export default function AdarshUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load(query?: string) {
    setLoading(true);
    const url = query
      ? `/api/adarsh/users?q=${encodeURIComponent(query)}`
      : "/api/adarsh/users";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function updatePlan(userId: string, plan: string) {
    setSaving(userId);
    const res = await fetch("/api/adarsh/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, plan }),
    });
    if (res.ok) await load(q || undefined);
    setSaving(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.03em]">
          User management
        </h1>
        <p className="text-[13px] text-[#697386]">
          Sentiment scores, pain points, and plan controls
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load(q.trim() || undefined);
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a3acb9]" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email or name…"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#635bff]" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#e6ebf1] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-[13px]">
              <thead className="border-b border-[#e6ebf1] bg-[#f6f9fc] text-[11px] uppercase tracking-wider text-[#a3acb9]">
                <tr>
                  <th className="px-3 py-2.5 font-medium">User</th>
                  <th className="px-3 py-2.5 font-medium">Sentiment</th>
                  <th className="px-3 py-2.5 font-medium">Books</th>
                  <th className="px-3 py-2.5 font-medium">Usage</th>
                  <th className="px-3 py-2.5 font-medium">Plan</th>
                  <th className="px-3 py-2.5 font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <Fragment key={u.userId}>
                    <tr
                      className="cursor-pointer border-b border-[#e6ebf1] hover:bg-[#fafbff]"
                      onClick={() =>
                        setExpanded(expanded === u.userId ? null : u.userId)
                      }
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-[#0a2540]">{u.email}</p>
                        <p className="text-[11px] text-[#697386]">
                          {u.name || "—"}
                          {u.stuck ? " · stuck" : ""}
                          {u.onTrial ? " · trial" : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                            labelStyle[u.label] ?? labelStyle.neutral
                          )}
                        >
                          {u.label} · {u.score}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-[#425466]">
                        {u.completed}/{u.books}
                        {u.failed > 0 ? (
                          <span className="text-[#df1b41]"> · {u.failed}f</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-[#425466]">
                        {u.pagesUsed}/{u.pagesLimit}p
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
                          <SelectTrigger className="h-8 w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["FREE", "PRO", "ENTERPRISE", "UNLIMITED"].map(
                              (p) => (
                                <SelectItem key={p} value={p}>
                                  {p}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2.5 text-[#697386]">
                        {u.daysSinceActive === 0
                          ? "today"
                          : `${u.daysSinceActive}d ago`}
                      </td>
                    </tr>
                    {expanded === u.userId && (
                      <tr className="border-b border-[#e6ebf1] bg-[#fafbff]">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div>
                              <p className="text-[11px] font-medium uppercase text-[#0e6245]">
                                Happy
                              </p>
                              <ul className="mt-1 space-y-0.5 text-[12px] text-[#425466]">
                                {u.happy.length === 0 && <li>—</li>}
                                {u.happy.map((h) => (
                                  <li key={h}>• {h}</li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <p className="text-[11px] font-medium uppercase text-[#df1b41]">
                                Disappointed
                              </p>
                              <ul className="mt-1 space-y-0.5 text-[12px] text-[#425466]">
                                {u.pain.length === 0 && <li>—</li>}
                                {u.pain.map((h) => (
                                  <li key={h}>• {h}</li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <p className="text-[11px] font-medium uppercase text-[#635bff]">
                                Improve
                              </p>
                              <ul className="mt-1 space-y-0.5 text-[12px] text-[#425466]">
                                {u.improvements.length === 0 && <li>—</li>}
                                {u.improvements.map((h) => (
                                  <li key={h}>• {h}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
