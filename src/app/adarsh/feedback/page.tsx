"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FeedbackRow = {
  id: string;
  rating: number | null;
  sentiment: string;
  trigger: string;
  comment: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string | null; plan: string };
  book: {
    id: string;
    title: string;
    status: string;
    errorMessage: string | null;
    progress: number;
  };
};

type Payload = {
  summary: {
    total: number;
    complaints: number;
    happy: number;
    avgRating: number | null;
  };
  feedbacks: FeedbackRow[];
};

const sentimentStyle: Record<string, string> = {
  happy: "bg-[#cbf4c9] text-[#0e6245]",
  ok: "bg-[#f0f3f7] text-[#697386]",
  disappointed: "bg-[#fcf5e0] text-[#9a6700]",
  complaint: "bg-[#fde8e8] text-[#df1b41]",
};

export default function AdarshFeedbackPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [filter, setFilter] = useState<"all" | "complaints" | "happy">("complaints");
  const [loading, setLoading] = useState(true);

  async function load(nextFilter = filter) {
    setLoading(true);
    const res = await fetch(`/api/adarsh/feedback?filter=${nextFilter}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.03em]">
            Reviews & complaints
          </h1>
          <p className="text-[13px] text-[#697386]">
            Feedback after generation and manual troubleshoot reports
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[#e6ebf1] bg-white px-4 py-3">
            <p className="text-[11px] uppercase text-[#a3acb9]">In view</p>
            <p className="text-[22px] font-semibold">{data.summary.total}</p>
          </div>
          <div className="rounded-xl border border-[#e6ebf1] bg-white px-4 py-3">
            <p className="text-[11px] uppercase text-[#a3acb9]">Complaints</p>
            <p className="text-[22px] font-semibold text-[#df1b41]">
              {data.summary.complaints}
            </p>
          </div>
          <div className="rounded-xl border border-[#e6ebf1] bg-white px-4 py-3">
            <p className="text-[11px] uppercase text-[#a3acb9]">Avg rating</p>
            <p className="text-[22px] font-semibold">
              {data.summary.avgRating ?? "—"}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["complaints", "Complaints"],
            ["happy", "Happy"],
            ["all", "All"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setFilter(id);
              void load(id);
            }}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-medium",
              filter === id
                ? "bg-[#0a2540] text-white"
                : "border border-[#e6ebf1] bg-white text-[#425466]"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading || !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#635bff]" />
        </div>
      ) : (
        <ul className="space-y-2">
          {data.feedbacks.length === 0 && (
            <li className="rounded-xl border border-[#e6ebf1] bg-white p-6 text-[13px] text-[#697386]">
              No feedback in this filter yet.
            </li>
          )}
          {data.feedbacks.map((f) => (
            <li
              key={f.id}
              className="rounded-xl border border-[#e6ebf1] bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                        sentimentStyle[f.sentiment] ?? sentimentStyle.ok
                      )}
                    >
                      {f.sentiment}
                      {f.rating != null ? ` · ${f.rating}★` : ""}
                    </span>
                    <span className="text-[11px] text-[#a3acb9]">
                      {f.trigger}
                    </span>
                  </div>
                  <p className="mt-1 text-[14px] font-semibold">
                    <Link
                      href={`/adarsh/books/${f.book.id}`}
                      className="hover:text-[#635bff]"
                    >
                      {f.book.title}
                    </Link>
                  </p>
                  <p className="text-[12px] text-[#697386]">
                    {f.user.email} · {f.user.plan} · book {f.book.status}
                  </p>
                  {f.comment && (
                    <p className="mt-2 rounded-lg bg-[#f6f9fc] px-3 py-2 text-[13px] text-[#0a2540]">
                      “{f.comment}”
                    </p>
                  )}
                  {f.book.errorMessage && (
                    <p className="mt-2 font-mono text-[11px] text-[#df1b41]">
                      {f.book.errorMessage.slice(0, 200)}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 text-[11px] text-[#a3acb9]">
                  <span>{new Date(f.createdAt).toLocaleString()}</span>
                  <Link
                    href={`/adarsh/books/${f.book.id}`}
                    className="font-medium text-[#635bff]"
                  >
                    Diagnose →
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
