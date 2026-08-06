"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Detail = {
  book: {
    id: string;
    title: string;
    slug: string;
    status: string;
    progress: number;
    currentPages: number;
    targetPages: number;
    genre: string | null;
    model: string | null;
    coverImage: string | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    user: {
      id: string;
      email: string;
      name: string | null;
      plan: string;
      pagesUsed: number;
      pagesLimit: number;
    };
  };
  issues: Array<{
    severity: string;
    code: string;
    title: string;
    detail: string;
    fix: string;
  }>;
  chapters: Array<{
    id: string;
    number: number;
    title: string;
    status: string;
    pageCount: number;
    sections: number;
    sectionsDone: number;
  }>;
  jobs: Array<{
    id: string;
    type: string;
    status: string;
    error: string | null;
    attempts: number;
    maxAttempts: number;
    createdAt: string;
    durationSec: number | null;
    payload: unknown;
  }>;
  audios: Array<{
    id: string;
    type: string;
    status: string;
    progress: number;
    errorMessage: string | null;
  }>;
  feedbacks: Array<{
    id: string;
    rating: number | null;
    sentiment: string;
    trigger: string;
    comment: string | null;
    createdAt: string;
  }>;
  stats: {
    sectionsTotal: number;
    sectionsWithContent: number;
    chaptersDone: number;
    chapterCount: number;
  };
};

const sev: Record<string, string> = {
  critical: "border-[#fde8e8] bg-[#fff5f5]",
  high: "border-[#fcf5e0] bg-[#fffbeb]",
  medium: "border-[#ebe9ff] bg-[#fafaff]",
  low: "border-[#e6ebf1] bg-white",
  ok: "border-[#cbf4c9] bg-[#f6fff8]",
};

export default function AdarshBookDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await fetch(`/api/adarsh/books/${id}`);
      if (!res.ok) {
        setError("Failed to load");
        return;
      }
      setData(await res.json());
    })();
  }, [id]);

  if (!data && !error) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[#635bff]" />
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-[#df1b41]">{error ?? "Not found"}</p>;
  }

  const { book, issues, chapters, jobs, audios, feedbacks, stats } = data;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/adarsh/books" className="text-[12px] text-[#635bff]">
          ← Generations
        </Link>
        <h1 className="mt-1 text-[22px] font-semibold tracking-[-0.03em]">
          {book.title}
        </h1>
        <p className="text-[13px] text-[#697386]">
          {book.user.email} · {book.status} · {Math.round(book.progress)}% ·{" "}
          {book.currentPages}/{book.targetPages} pages ·{" "}
          <Link href={`/dashboard/books/${book.id}`} className="text-[#635bff]">
            open in app
          </Link>
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-[14px] font-semibold">Troubleshoot</h2>
        {issues.map((issue) => (
          <div
            key={issue.code + issue.title}
            className={cn(
              "rounded-xl border px-4 py-3",
              sev[issue.severity] ?? sev.low
            )}
          >
            <p className="text-[11px] font-medium uppercase tracking-wider opacity-70">
              {issue.severity} · {issue.code}
            </p>
            <p className="mt-1 text-[14px] font-semibold">{issue.title}</p>
            <p className="mt-1 text-[13px] text-[#425466]">{issue.detail}</p>
            <p className="mt-2 text-[13px] font-medium text-[#0a2540]">
              → {issue.fix}
            </p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[#e6ebf1] bg-white px-4 py-3">
          <p className="text-[11px] text-[#a3acb9]">Chapters</p>
          <p className="text-[20px] font-semibold">
            {stats.chaptersDone}/{stats.chapterCount}
          </p>
        </div>
        <div className="rounded-xl border border-[#e6ebf1] bg-white px-4 py-3">
          <p className="text-[11px] text-[#a3acb9]">Sections with prose</p>
          <p className="text-[20px] font-semibold">
            {stats.sectionsWithContent}/{stats.sectionsTotal}
          </p>
        </div>
        <div className="rounded-xl border border-[#e6ebf1] bg-white px-4 py-3">
          <p className="text-[11px] text-[#a3acb9]">Cover</p>
          <p className="text-[20px] font-semibold">
            {book.coverImage ? "Yes" : "Missing"}
          </p>
        </div>
      </div>

      {book.errorMessage && (
        <pre className="overflow-x-auto rounded-xl bg-[#0a2540] p-4 text-[12px] text-[#cbf4c9]">
          {book.errorMessage}
        </pre>
      )}

      <section className="rounded-xl border border-[#e6ebf1] bg-white p-4">
        <h2 className="mb-3 text-[14px] font-semibold">Generation jobs</h2>
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li
              key={j.id}
              className="rounded-lg border border-[#e6ebf1] px-3 py-2 text-[12px]"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">
                  {j.type} · {j.status}
                </span>
                <span className="text-[#697386]">
                  attempt {j.attempts}/{j.maxAttempts}
                  {j.durationSec != null ? ` · ${j.durationSec}s` : ""}
                </span>
              </div>
              {j.error && (
                <p className="mt-1 font-mono text-[#df1b41]">{j.error}</p>
              )}
              <p className="mt-0.5 text-[#a3acb9]">{j.createdAt}</p>
            </li>
          ))}
          {jobs.length === 0 && (
            <li className="text-[13px] text-[#697386]">No jobs recorded.</li>
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-[#e6ebf1] bg-white p-4">
        <h2 className="mb-3 text-[14px] font-semibold">Chapters</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="text-[#a3acb9]">
              <tr>
                <th className="py-1 pr-3">#</th>
                <th className="py-1 pr-3">Title</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1 pr-3">Sections</th>
                <th className="py-1">Pages</th>
              </tr>
            </thead>
            <tbody>
              {chapters.map((c) => (
                <tr key={c.id} className="border-t border-[#e6ebf1]">
                  <td className="py-1.5 pr-3 tabular-nums">{c.number}</td>
                  <td className="py-1.5 pr-3">{c.title}</td>
                  <td className="py-1.5 pr-3">{c.status}</td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {c.sectionsDone}/{c.sections}
                  </td>
                  <td className="py-1.5 tabular-nums">{c.pageCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {audios.length > 0 && (
        <section className="rounded-xl border border-[#e6ebf1] bg-white p-4">
          <h2 className="mb-3 text-[14px] font-semibold">Audio</h2>
          <ul className="space-y-1 text-[12px]">
            {audios.map((a) => (
              <li key={a.id}>
                {a.type} · {a.status} · {Math.round(a.progress)}%
                {a.errorMessage ? (
                  <span className="text-[#df1b41]"> — {a.errorMessage}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-[#e6ebf1] bg-white p-4">
        <h2 className="mb-3 text-[14px] font-semibold">
          User reviews & complaints
        </h2>
        {feedbacks.length === 0 ? (
          <p className="text-[13px] text-[#697386]">No feedback yet.</p>
        ) : (
          <ul className="space-y-2">
            {feedbacks.map((f) => (
              <li
                key={f.id}
                className="rounded-lg border border-[#e6ebf1] px-3 py-2 text-[12px]"
              >
                <p className="font-medium capitalize">
                  {f.sentiment}
                  {f.rating != null ? ` · ${f.rating}★` : ""} · {f.trigger}
                </p>
                {f.comment && (
                  <p className="mt-1 text-[#0a2540]">“{f.comment}”</p>
                )}
                <p className="mt-0.5 text-[#a3acb9]">{f.createdAt}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
