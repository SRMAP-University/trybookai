"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
  Headphones,
  Loader2,
  Mic2,
  Music2,
  X,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { readJson } from "@/lib/api";
import { cn } from "@/lib/utils";

type ActiveBookJob = {
  id: string;
  title: string;
  status: string;
  progress: number;
  currentPages: number;
  targetPages: number;
};

type ActiveAudioJob = {
  id: string;
  bookId: string;
  bookTitle: string;
  type: "AUDIOBOOK" | "PODCAST" | "MUSIC";
  status: string;
  progress: number;
  title: string | null;
};

type ActiveJobsResponse = {
  books: ActiveBookJob[];
  audios: ActiveAudioJob[];
};

const POLL_MS = 4000;

const AUDIO_META = {
  AUDIOBOOK: { label: "Audiobook", icon: Headphones },
  PODCAST: { label: "Podcast", icon: Mic2 },
  MUSIC: { label: "Theme music", icon: Music2 },
} as const;

function statusLabel(status: string) {
  switch (status) {
    case "OUTLINING":
      return "Outlining";
    case "GENERATING":
      return "Generating";
    case "PENDING":
      return "Queued";
    default:
      return status.toLowerCase();
  }
}

export function GlobalGenerationWidget() {
  const [jobs, setJobs] = useState<ActiveJobsResponse>({
    books: [],
    audios: [],
  });
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const visibleKeyRef = useRef("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs/active", { cache: "no-store" });
      const result = await readJson<ActiveJobsResponse>(res);
      if (!result.ok) return;
      setJobs({
        books: result.data.books ?? [],
        audios: result.data.audios ?? [],
      });
    } catch {
      // ignore transient poll errors
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const total = jobs.books.length + jobs.audios.length;
  const key = [
    ...jobs.books.map((b) => b.id),
    ...jobs.audios.map((a) => a.id),
  ]
    .sort()
    .join("|");

  useEffect(() => {
    if (total > 0 && key !== visibleKeyRef.current) {
      setDismissed(false);
      setCollapsed(false);
      visibleKeyRef.current = key;
    }
    if (total === 0) {
      visibleKeyRef.current = "";
    }
  }, [total, key]);

  if (total === 0 || dismissed) return null;

  return (
    <div
      className={cn(
        "fixed right-4 z-40 w-[min(100vw-2rem,340px)]",
        "bottom-20 lg:bottom-6"
      )}
    >
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex w-full items-center gap-2.5 rounded-full border border-[#e6ebf1] bg-white px-4 py-2.5 text-left shadow-[0_12px_40px_rgba(10,37,64,0.14)]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ebe9ff] text-[#635bff]">
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-[#0a2540]">
              {total} job{total === 1 ? "" : "s"} running
            </span>
            <span className="block truncate text-[11px] text-[#697386]">
              Tap to see progress
            </span>
          </span>
        </button>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#e6ebf1] bg-white shadow-[0_16px_48px_rgba(10,37,64,0.16)]">
          <div className="flex items-center justify-between gap-2 border-b border-[#eef1f5] bg-[#fafbfc] px-4 py-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-[#635bff]" />
              <p className="text-[13px] font-semibold text-[#0a2540]">
                {total} generating
              </p>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label="Collapse"
                onClick={() => setCollapsed(true)}
                className="rounded-md p-1.5 text-[#697386] hover:bg-white hover:text-[#0a2540]"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setDismissed(true)}
                className="rounded-md p-1.5 text-[#697386] hover:bg-white hover:text-[#0a2540]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <ul className="max-h-[min(50vh,320px)] divide-y divide-[#eef1f5] overflow-y-auto">
            {jobs.books.map((book) => {
              const pct = Math.round(book.progress || 0);
              return (
                <li key={`book-${book.id}`}>
                  <Link
                    href={`/dashboard/books/${book.id}`}
                    className="block px-4 py-3 transition-colors hover:bg-[#f6f9fc]"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#ebe9ff] text-[#635bff]">
                        <BookOpen className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-[#0a2540]">
                          {book.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#697386]">
                          Book · {statusLabel(book.status)} · {pct}%
                          {book.currentPages > 0
                            ? ` · ${book.currentPages} pages written`
                            : ""}
                          {book.targetPages > 0
                            ? ` (target ${book.targetPages})`
                            : ""}
                        </p>
                        <Progress value={pct} className="mt-2 h-1.5" />
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}

            {jobs.audios.map((audio) => {
              const meta = AUDIO_META[audio.type];
              const Icon = meta.icon;
              const pct = Math.round(audio.progress || 0);
              return (
                <li key={`audio-${audio.id}`}>
                  <Link
                    href={`/dashboard/books/${audio.bookId}`}
                    className="block px-4 py-3 transition-colors hover:bg-[#f6f9fc]"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#cbf4c9] text-[#0e6245]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-[#0a2540]">
                          {audio.title || `${audio.bookTitle} — ${meta.label}`}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#697386]">
                          {meta.label} · {statusLabel(audio.status)} · {pct}%
                        </p>
                        <Progress value={pct} className="mt-2 h-1.5" />
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
