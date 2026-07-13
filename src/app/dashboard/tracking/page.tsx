"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { AnonymousRouteFallback } from "@/components/dashboard/anonymous-route-fallback";

type Job = {
  id: string;
  type: string;
  status: string;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  book: { id: string; title: string };
};

type Book = {
  id: string;
  title: string;
  status: string;
  progress: number;
  currentPages: number;
  targetPages: number;
  updatedAt: string;
};

type Analytics = {
  summary: {
    activeJobs: number;
    failedJobs: number;
    completedBooks: number;
    totalBooks: number;
  };
  books: Book[];
  jobs: Job[];
};

const jobStatusStyles: Record<string, string> = {
  PENDING: "text-[#697386]",
  RUNNING: "text-[#9a6700] bg-[#fcf5e0] px-2 py-0.5 rounded",
  COMPLETED: "text-[#0e6245] bg-[#cbf4c9] px-2 py-0.5 rounded",
  FAILED: "text-[#df1b41] bg-[#fde8e8] px-2 py-0.5 rounded",
};

function TrackingPageContent() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/analytics");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[#635bff]" />
      </div>
    );
  }

  const inProgress = data.books.filter(
    (b) => b.status === "GENERATING" || b.status === "OUTLINING"
  );
  const recentJobs = data.jobs.slice(0, 20);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            Tracking
          </h1>
          <p className="mt-1 text-[14px] text-[#697386]">
            Live generation jobs, progress, and recent activity.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={load}
          className="h-9 border-[#e6ebf1] text-[13px]"
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#e6ebf1] bg-[#e6ebf1] lg:grid-cols-4">
        {[
          { label: "Active jobs", value: data.summary.activeJobs },
          { label: "In progress books", value: inProgress.length },
          { label: "Failed jobs", value: data.summary.failedJobs },
          {
            label: "Completed books",
            value: data.summary.completedBooks,
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

      <div className="mt-10">
        <h2 className="text-[15px] font-medium text-[#0a2540]">
          Books in progress
        </h2>
        {inProgress.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-[#e6ebf1] px-6 py-10 text-center text-[14px] text-[#697386]">
            No books generating right now.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {inProgress.map((book) => (
              <Link
                key={book.id}
                href={`/dashboard/books/${book.id}`}
                className="block rounded-lg border border-[#e6ebf1] bg-white p-4 hover:border-[#635bff]/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-medium text-[#0a2540]">
                      {book.title}
                    </p>
                    <p className="mt-0.5 text-[12px] capitalize text-[#697386]">
                      {book.status.toLowerCase()} · {book.currentPages}/
                      {book.targetPages} pages
                    </p>
                  </div>
                  <span className="text-[13px] font-medium text-[#635bff]">
                    {Math.round(book.progress)}%
                  </span>
                </div>
                <Progress value={book.progress} className="mt-3 h-1.5" />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-10">
        <h2 className="text-[15px] font-medium text-[#0a2540]">
          Generation activity
        </h2>
        <div className="mt-4 overflow-hidden rounded-lg border border-[#e6ebf1]">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#e6ebf1] bg-[#f6f9fc]">
                <th className="px-4 py-3 text-[12px] font-medium uppercase tracking-wider text-[#697386]">
                  Book
                </th>
                <th className="px-4 py-3 text-[12px] font-medium uppercase tracking-wider text-[#697386]">
                  Type
                </th>
                <th className="px-4 py-3 text-[12px] font-medium uppercase tracking-wider text-[#697386]">
                  Status
                </th>
                <th className="hidden px-4 py-3 text-[12px] font-medium uppercase tracking-wider text-[#697386] md:table-cell">
                  Started
                </th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-[14px] text-[#697386]"
                  >
                    No generation jobs yet.
                  </td>
                </tr>
              ) : (
                recentJobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-[#e6ebf1] last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/books/${job.book.id}`}
                        className="text-[14px] font-medium text-[#635bff] hover:underline"
                      >
                        {job.book.title}
                      </Link>
                      {job.error && (
                        <p className="mt-0.5 line-clamp-1 text-[12px] text-[#df1b41]">
                          {job.error}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[#425466]">
                      {job.type.replaceAll("_", " ")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "text-[12px] font-medium capitalize",
                          jobStatusStyles[job.status] ?? "text-[#697386]"
                        )}
                      >
                        {job.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-[13px] text-[#697386] md:table-cell">
                      {new Date(
                        job.startedAt ?? job.createdAt
                      ).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function TrackingPage() {
  return (
    <AnonymousRouteFallback
      title="Tracking"
      description="Monitor active generation jobs and recently completed books."
    >
      <TrackingPageContent />
    </AnonymousRouteFallback>
  );
}
