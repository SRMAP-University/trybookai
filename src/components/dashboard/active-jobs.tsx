"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { BookOpen, Headphones, Mic2, MicVocal, Music2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { readJson } from "@/lib/api";

export type ActiveBookJob = {
  id: string;
  title: string;
  status: string;
  progress: number;
  currentPages: number;
  targetPages: number;
};

export type ActiveAudioJob = {
  id: string;
  bookId: string;
  bookTitle: string;
  type: "AUDIOBOOK" | "PODCAST" | "MUSIC" | "SONG";
  status: string;
  progress: number;
  title: string | null;
};

type ActiveJobs = {
  books: ActiveBookJob[];
  audios: ActiveAudioJob[];
  total: number;
  /** Average progress across running jobs, 0–100 */
  overall: number;
};

const POLL_MS = 8_000;

const AUDIO_META = {
  AUDIOBOOK: { label: "Audiobook", icon: Headphones },
  PODCAST: { label: "Podcast", icon: Mic2 },
  MUSIC: { label: "Theme music", icon: Music2 },
  SONG: { label: "Song", icon: MicVocal },
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

const ActiveJobsContext = createContext<ActiveJobs>({ books: [], audios: [], total: 0, overall: 0 });

/** Books and audio being generated for this user, polled once for the whole dashboard. */
export function ActiveJobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<{ books: ActiveBookJob[]; audios: ActiveAudioJob[] }>({
    books: [],
    audios: [],
  });

  useEffect(() => {
    let alive = true;
    // State is set in the fetch callback, never synchronously in the effect.
    const load = () => {
      void fetch("/api/jobs/active", { cache: "no-store" })
        .then((res) => readJson<{ books: ActiveBookJob[]; audios: ActiveAudioJob[] }>(res))
        .then((result) => {
          if (alive && result.ok) {
            setJobs({ books: result.data.books ?? [], audios: result.data.audios ?? [] });
          }
        })
        .catch(() => undefined); // ignore transient poll errors
    };
    load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("focus", load);
    };
  }, []);

  const value = useMemo<ActiveJobs>(() => {
    const all = [...jobs.books.map((b) => b.progress || 0), ...jobs.audios.map((a) => a.progress || 0)];
    return {
      ...jobs,
      total: all.length,
      overall: all.length ? all.reduce((sum, p) => sum + p, 0) / all.length : 0,
    };
  }, [jobs]);

  return <ActiveJobsContext.Provider value={value}>{children}</ActiveJobsContext.Provider>;
}

export function useActiveJobs() {
  return useContext(ActiveJobsContext);
}

/** The running jobs, each linking to its book. */
export function ActiveJobsList({ onNavigate }: { onNavigate?: () => void }) {
  const { books, audios } = useActiveJobs();
  return (
    <ul className="max-h-[min(50vh,320px)] divide-y divide-[#eef1f5] overflow-y-auto">
      {books.map((book) => {
        const pct = Math.round(book.progress || 0);
        return (
          <li key={`book-${book.id}`}>
            <Link
              href={`/dashboard/books/${book.id}`}
              onClick={onNavigate}
              className="block px-4 py-3 transition-colors hover:bg-[#f6f9fc]"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#ebe9ff] text-[#635bff]">
                  <BookOpen className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[#0a2540]">{book.title}</p>
                  <p className="mt-0.5 text-[11px] text-[#697386]">
                    Book · {statusLabel(book.status)} · {pct}%
                    {book.currentPages > 0 ? ` · ${book.currentPages} pages written` : ""}
                    {book.targetPages > 0 ? ` (target ${book.targetPages})` : ""}
                  </p>
                  <Progress value={pct} className="mt-2 h-1.5" />
                </div>
              </div>
            </Link>
          </li>
        );
      })}

      {audios.map((audio) => {
        const meta = AUDIO_META[audio.type];
        const Icon = meta.icon;
        const pct = Math.round(audio.progress || 0);
        return (
          <li key={`audio-${audio.id}`}>
            <Link
              href={`/dashboard/books/${audio.bookId}`}
              onClick={onNavigate}
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
  );
}
