"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BookRow = {
  id: string;
  title: string;
  status: string;
  progress: number;
  currentPages: number;
  targetPages: number;
  hasCover: boolean;
  genre: string | null;
  model: string | null;
  updatedAt: string;
  user: { id: string; email: string; name: string | null; plan: string };
  jobs: number;
  lastJobError: string | null;
  trouble: {
    severity: string;
    code: string;
    title: string;
    detail: string;
    fix: string;
  };
};

const sev: Record<string, string> = {
  critical: "bg-[#fde8e8] text-[#df1b41]",
  high: "bg-[#fcf5e0] text-[#9a6700]",
  medium: "bg-[#ebe9ff] text-[#635bff]",
  low: "bg-[#f0f3f7] text-[#697386]",
  ok: "bg-[#cbf4c9] text-[#0e6245]",
};

export default function AdarshBooksPage() {
  const [books, setBooks] = useState<BookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "issues" | "failed" | "active">(
    "issues"
  );

  async function load() {
    setLoading(true);
    const res = await fetch("/api/adarsh/books");
    if (res.ok) {
      const data = await res.json();
      setBooks(data.books);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = books.filter((b) => {
    if (filter === "all") return true;
    if (filter === "failed") return b.status === "FAILED";
    if (filter === "active")
      return b.status === "GENERATING" || b.status === "OUTLINING";
    return b.trouble.severity !== "ok";
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.03em]">
            Generation troubleshoot
          </h1>
          <p className="text-[13px] text-[#697386]">
            Per-book health checks, errors, and suggested fixes
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["issues", "Needs attention"],
            ["failed", "Failed"],
            ["active", "In progress"],
            ["all", "All"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-medium",
              filter === id
                ? "bg-[#0a2540] text-white"
                : "bg-white text-[#425466] border border-[#e6ebf1]"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#635bff]" />
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.length === 0 && (
            <li className="rounded-xl border border-[#e6ebf1] bg-white p-6 text-[13px] text-[#697386]">
              Nothing in this filter.
            </li>
          )}
          {filtered.map((b) => (
            <li
              key={b.id}
              className="rounded-xl border border-[#e6ebf1] bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/adarsh/books/${b.id}`}
                      className="truncate text-[15px] font-semibold hover:text-[#635bff]"
                    >
                      {b.title}
                    </Link>
                    <span className="rounded bg-[#f0f3f7] px-1.5 py-0.5 text-[10px] font-medium text-[#697386]">
                      {b.status}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        sev[b.trouble.severity] ?? sev.low
                      )}
                    >
                      {b.trouble.code}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-[#697386]">
                    {b.user.email} · {b.user.plan} · {Math.round(b.progress)}% ·{" "}
                    {b.currentPages}/{b.targetPages}p
                    {!b.hasCover ? " · no cover" : ""}
                    {b.model ? ` · ${b.model}` : ""}
                  </p>
                  <p className="mt-2 text-[13px] font-medium text-[#0a2540]">
                    {b.trouble.title}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#425466]">
                    {b.trouble.detail}
                  </p>
                  <p className="mt-1 text-[12px] text-[#635bff]">
                    Fix: {b.trouble.fix}
                  </p>
                  {b.lastJobError && (
                    <p className="mt-2 rounded-md bg-[#fff5f5] px-2 py-1 font-mono text-[11px] text-[#df1b41]">
                      {b.lastJobError.slice(0, 240)}
                    </p>
                  )}
                </div>
                <Link
                  href={`/adarsh/books/${b.id}`}
                  className="shrink-0 text-[12px] font-medium text-[#635bff]"
                >
                  Full diagnose →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
