"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  BookOpen,
  Clapperboard,
  Headphones,
  LayoutGrid,
  Mic2,
  MicVocal,
  Music2,
  type LucideIcon,
} from "lucide-react";
import { BookCoverCard } from "@/components/marketing/book-cover-card";
import { cn } from "@/lib/utils";

type ServiceId =
  | "book"
  | "audiobook"
  | "podcast"
  | "song"
  | "theme"
  | "movie";

const SERVICES: {
  id: ServiceId;
  label: string;
  icon: LucideIcon;
  placeholder: string;
  chips: string[];
  cta: string;
  available: boolean;
}[] = [
  {
    id: "book",
    label: "Book",
    icon: BookOpen,
    placeholder: "Describe a book…",
    chips: [
      "A mystery in a lighthouse",
      "Founders building an AI startup",
      "Fantasy quest through forgotten archives",
    ],
    cta: "Generate",
    available: true,
  },
  {
    id: "audiobook",
    label: "Audiobook",
    icon: Headphones,
    placeholder: "Describe narration or paste text to read…",
    chips: ["Chapter narration", "Nonfiction voice", "Storytime for kids"],
    cta: "Open studio",
    available: true,
  },
  {
    id: "podcast",
    label: "Podcast",
    icon: Mic2,
    placeholder: "Describe an episode angle or paste a manuscript…",
    chips: ["Book summary episode", "Founder interview style", "True-crime tone"],
    cta: "Open studio",
    available: true,
  },
  {
    id: "song",
    label: "Song",
    icon: MicVocal,
    placeholder: "Describe a song vibe, mood, or paste lyrics…",
    chips: ["Hopeful pop chorus", "Dark cinematic ballad", "Upbeat folk story"],
    cta: "Generate",
    available: true,
  },
  {
    id: "theme",
    label: "Theme",
    icon: Music2,
    placeholder: "Describe instrumental theme music for a book…",
    chips: ["Cinematic intro", "Quiet piano motif", "Epic trailer swell"],
    cta: "Open books",
    available: true,
  },
  {
    id: "movie",
    label: "Movie",
    icon: Clapperboard,
    placeholder: "Turn a finished book into a screenplay…",
    chips: ["Page to screen", "Shot list", "Scene breakdown"],
    cta: "Early access",
    available: false,
  },
];

export type PromptShowcaseCover = {
  id: string;
  title: string;
  genre?: string | null;
  coverImage: string | null;
  href: string;
};

type DashboardCreatePromptProps = {
  pagesRemaining: number;
  pagesLimit: number;
  firstName?: string | null;
  /** When set, Generate redirects here instead of studio routes (signed-out preview). */
  signInHref?: string;
  /** Desktop-only covers beside the prompt (user’s own, or public fallback). */
  showcaseCovers?: PromptShowcaseCover[];
};

export function DashboardCreatePrompt({
  pagesRemaining,
  pagesLimit: _pagesLimit,
  firstName,
  signInHref,
  showcaseCovers = [],
}: DashboardCreatePromptProps) {
  const router = useRouter();
  const [service, setService] = useState<ServiceId>("book");
  const [prompt, setPrompt] = useState("");
  const [focused, setFocused] = useState(false);

  const active = useMemo(
    () => SERVICES.find((s) => s.id === service) ?? SERVICES[0],
    [service]
  );

  const sideCovers = showcaseCovers.slice(0, 2);
  const coverA = sideCovers[0];
  const coverB = sideCovers[1] ?? sideCovers[0];
  const expanded = focused || prompt.trim().length > 0;

  const canGenerate =
    active.id === "movie" ||
    active.id === "audiobook" ||
    active.id === "podcast" ||
    active.id === "theme" ||
    prompt.trim().length > 0;

  function applyChip(chip: string) {
    setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${chip}` : chip));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canGenerate) return;

    if (signInHref) {
      router.push(signInHref);
      return;
    }

    const q = prompt.trim();

    switch (service) {
      case "book": {
        const params = new URLSearchParams();
        if (q) params.set("prompt", q.slice(0, 500));
        router.push(
          `/dashboard/books/new${params.toString() ? `?${params}` : ""}`
        );
        return;
      }
      case "audiobook":
      case "podcast":
        router.push("/dashboard/audio-studio");
        return;
      case "song": {
        const params = new URLSearchParams();
        if (q) params.set("prompt", q.slice(0, 500));
        router.push(
          `/dashboard/songs${params.toString() ? `?${params}` : ""}`
        );
        return;
      }
      case "theme":
        router.push("/dashboard/books");
        return;
      case "movie":
        window.open("https://litemoov.com", "_blank", "noopener,noreferrer");
        return;
    }
  }

  return (
    <div className="space-y-3">
      {firstName ? (
        <p className="text-[14px] text-[#697386]">
          Welcome back,{" "}
          <span className="font-medium text-[#0a2540]">{firstName}</span>
        </p>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-[#d8dee8] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_rgba(15,23,42,0.1)] ring-1 ring-black/[0.03] sm:rounded-[20px]"
      >
        {/* Service tabs — full scroll on phone */}
        <div className="flex gap-1 overflow-x-auto overscroll-x-contain border-b border-[#f0f2f5] px-3 pt-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SERVICES.map((s) => {
            const Icon = s.icon;
            const selected = service === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setService(s.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium transition-colors",
                  selected
                    ? "bg-[#f0f2f5] text-[#111827]"
                    : "text-[#6b7280] hover:bg-[#f7f8fa] hover:text-[#111827]"
                )}
              >
                <Icon className="h-3.5 w-3.5 opacity-80" strokeWidth={1.75} />
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Prompt + desktop covers */}
        <div
          className={cn(
            "px-4 pt-3 sm:px-5",
            coverA ? "lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-4" : ""
          )}
        >
          <div className="min-w-0">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, 2000))}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              rows={expanded ? 5 : 3}
              placeholder={active.placeholder}
              className={cn(
                "w-full resize-none bg-transparent text-[16px] leading-relaxed text-[#111827] outline-none placeholder:text-[#9ca3af] sm:text-[15px]",
                "transition-[min-height] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
                // Phone: always a complete, readable field — no mid-clip
                "min-h-[96px]",
                // Desktop: compact → expand on focus
                expanded ? "sm:min-h-[128px]" : "sm:min-h-[88px]"
              )}
            />

            <div className="-mx-4 mt-1 flex gap-2 overflow-x-auto overscroll-x-contain px-4 pb-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-4 [&::-webkit-scrollbar]:hidden">
              {active.chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => applyChip(chip)}
                  className="shrink-0 rounded-full bg-[#f3f4f6] px-3 py-1.5 text-[12px] text-[#4b5563] transition-colors hover:bg-[#e5e7eb] active:bg-[#e5e7eb]"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {coverA && coverB ? (
            <div className="relative mb-4 hidden h-[108px] w-[118px] shrink-0 lg:block">
              <Link
                href={coverA.href}
                className="absolute left-0 top-1 z-0 w-[68px] -rotate-6 transition-transform hover:-translate-y-0.5 hover:rotate-[-8deg]"
                title={coverA.title}
              >
                <BookCoverCard
                  book={{
                    id: coverA.id,
                    title: coverA.title,
                    genre: coverA.genre ?? null,
                    coverImage: coverA.coverImage,
                  }}
                  index={0}
                  variant="art"
                  className="aspect-[3/4] w-full shadow-[0_10px_24px_rgba(0,0,0,0.16)]"
                />
              </Link>
              <Link
                href={coverB.href}
                className="absolute bottom-0 right-0 z-[1] w-[76px] rotate-[5deg] transition-transform hover:-translate-y-0.5 hover:rotate-[7deg]"
                title={coverB.title}
              >
                <BookCoverCard
                  book={{
                    id: coverB.id,
                    title: coverB.title,
                    genre: coverB.genre ?? null,
                    coverImage: coverB.coverImage,
                  }}
                  index={1}
                  variant="art"
                  className="aspect-[3/4] w-full shadow-[0_12px_28px_rgba(0,0,0,0.2)]"
                />
              </Link>
            </div>
          ) : null}
        </div>

        {/* Footer — stacked cleanly on phone */}
        <div className="flex items-center justify-between gap-3 border-t border-[#f0f2f5] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2 text-[12px] text-[#6b7280]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[#111827]">
              <active.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{active.label}</span>
            </span>
            {!active.available && (
              <span className="rounded-full bg-[#fef3c7] px-2 py-0.5 text-[11px] font-medium text-[#92400e]">
                Waitlist
              </span>
            )}
            <span className="hidden items-center gap-1 tabular-nums sm:inline-flex">
              <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} />
              {pagesRemaining.toLocaleString()} left
            </span>
          </div>

          <button
            type="submit"
            disabled={!canGenerate}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-colors sm:h-9",
              canGenerate
                ? "bg-[#374151] text-white hover:bg-[#1f2937]"
                : "cursor-not-allowed bg-[#e5e7eb] text-[#9ca3af]"
            )}
          >
            {active.cta}
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
