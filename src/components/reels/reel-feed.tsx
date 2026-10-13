"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Captions,
  CaptionsOff,
  Clapperboard,
  ListVideo,
  Loader2,
  Music2,
  Play,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { BackgroundScorePlayer } from "@/components/dashboard/background-score";
import { RailButton, ReelStage, formatReelTime } from "@/components/reels/reel-stage";
import { cn } from "@/lib/utils";
import type { ScoreMood } from "@/lib/audio-generator/score-types";
import type { ReelFeedItem, ReelFeedPage } from "@/lib/reel-generator/types";

/**
 * Public Story Reels, one full-screen card per reel, scrolled with snap like
 * TikTok. The card in view plays; one shared <audio> drives every card, which
 * keeps sound working on phones after the first tap. A chapter series plays
 * part after part, and the last part loops.
 */
export function ReelFeed() {
  const router = useRouter();
  const [items, setItems] = useState<ReelFeedItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(true);
  const fetchingRef = useRef(false);
  const itemsRef = useRef<ReelFeedItem[]>([]);

  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const [parts, setParts] = useState<Record<string, number>>({});
  const [partsOpen, setPartsOpen] = useState<string | null>(null);
  const [mood, setMood] = useState<ScoreMood | null>(null);
  const [playing, setPlaying] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const unlockedRef = useRef(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scoreRef = useRef<BackgroundScorePlayer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const loadMore = useCallback(async () => {
    if (fetchingRef.current || !hasMoreRef.current) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    try {
      const qs = cursorRef.current ? `?cursor=${encodeURIComponent(cursorRef.current)}` : "";
      const res = await fetch(`/api/public/reel-feed${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as ReelFeedPage;
      cursorRef.current = page.nextCursor;
      hasMoreRef.current = Boolean(page.nextCursor);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.reel.id));
        return [...prev, ...page.items.filter((i) => !seen.has(i.reel.id))];
      });
      setStatus("ready");
    } catch {
      setStatus((s) => (s === "loading" ? "error" : s));
    } finally {
      fetchingRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  // First page, fetched from a timer callback rather than the effect body.
  useEffect(() => {
    const timer = setTimeout(() => void loadMore(), 0);
    return () => clearTimeout(timer);
  }, [loadMore]);

  // The card at least 60% in view becomes the active one.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.index);
          if (activeRef.current !== index) {
            activeRef.current = index;
            // Each card starts from the top, even if its audio file is the same.
            if (audioRef.current) audioRef.current.currentTime = 0;
            setActive(index);
            setPartsOpen(null);
          }
          if (index >= itemsRef.current.length - 2) void loadMore();
        }
      },
      { root, threshold: 0.6 }
    );
    cardRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [items.length, loadMore]);

  const item = items[active];
  const partIndex = item ? Math.min(parts[item.reel.id] ?? 0, item.reel.episodes.length - 1) : 0;
  const episode = item?.reel.episodes[partIndex] ?? null;

  // Mood music for the reel in view.
  useEffect(() => {
    const music = item?.reel.music;
    if (!music) {
      scoreRef.current?.setEnabled(false);
      return;
    }
    if (scoreRef.current) scoreRef.current.setScore(music);
    else scoreRef.current = new BackgroundScorePlayer(music);
    scoreRef.current.setEnabled(musicOn);
  }, [item?.reel.music, musicOn]);
  useEffect(() => () => scoreRef.current?.dispose(), []);

  // The stage in view reads the shared audio clock itself, every frame.
  const getTime = useCallback(() => (audioRef.current?.currentTime ?? 0) * 1000, []);
  const openingFrame = useCallback(() => 0, []);

  function syncMusic(el: HTMLAudioElement) {
    if (episode) scoreRef.current?.sync(episode.number, el.currentTime, !el.paused && !el.ended);
  }

  function tap(index: number) {
    if (index !== active) return;
    const el = audioRef.current;
    if (!el) return;
    if (!unlockedRef.current) {
      unlockedRef.current = true;
      setUnlocked(true);
    }
    if (el.paused) {
      scoreRef.current?.unlock();
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/dashboard");
  }

  function scrollToCard(index: number) {
    const target = cardRefs.current[index];
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function pickPart(reelId: string, part: number) {
    if (audioRef.current) audioRef.current.currentTime = 0;
    setParts((prev) => ({ ...prev, [reelId]: part }));
    setPartsOpen(null);
  }

  async function share(feedItem: ReelFeedItem) {
    const url = `${window.location.origin}/books/${feedItem.book.slug}`;
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title: feedItem.book.title, url }).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link to the book copied");
    } catch {
      toast.message("Book link", { description: url });
    }
  }

  // Keyboard on desktop: arrows move between reels, space plays.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    keyHandler.current = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") {
        goBack();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        scrollToCard(active + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        scrollToCard(active - 1);
      } else if (e.key === " ") {
        e.preventDefault();
        tap(active);
      }
    };
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[60] h-dvh snap-y snap-mandatory overflow-y-scroll overscroll-contain bg-black [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <button
        type="button"
        onClick={goBack}
        aria-label="Back"
        className="fixed left-3 top-[calc(max(8px,env(safe-area-inset-top))+12px)] z-[61] flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <audio
        ref={audioRef}
        src={episode?.audioUrl ?? undefined}
        preload="auto"
        onLoadedData={(e) => {
          if (unlockedRef.current) void e.currentTarget.play().catch(() => undefined);
        }}
        onPlay={(e) => {
          setPlaying(true);
          syncMusic(e.currentTarget);
        }}
        onPause={(e) => {
          setPlaying(false);
          syncMusic(e.currentTarget);
        }}
        onTimeUpdate={(e) => syncMusic(e.currentTarget)}
        onEnded={(e) => {
          if (item && partIndex < item.reel.episodes.length - 1) {
            pickPart(item.reel.id, partIndex + 1);
            return;
          }
          // Like TikTok, the last part loops.
          e.currentTarget.currentTime = 0;
          void e.currentTarget.play().catch(() => undefined);
        }}
      />

      {status === "loading" && (
        <div className="flex h-full items-center justify-center text-white/70">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {status === "error" && (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-white">
          <p className="text-[15px] font-medium">Couldn&apos;t load reels.</p>
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              void loadMore();
            }}
            className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#0a2540]"
          >
            Try again
          </button>
        </div>
      )}

      {status === "ready" && items.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-white">
          <Clapperboard className="h-8 w-8 text-white/60" />
          <p className="text-[16px] font-semibold">No reels yet</p>
          <p className="max-w-[300px] text-[13px] text-white/65">
            Reels made from public books show up here. Make one from any finished book.
          </p>
          <Link
            href="/dashboard/books"
            className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#0a2540]"
          >
            Your books
          </Link>
        </div>
      )}

      {items.map((feedItem, i) => {
        const isActive = i === active;
        const part = isActive
          ? partIndex
          : Math.min(parts[feedItem.reel.id] ?? 0, feedItem.reel.episodes.length - 1);
        const ep = feedItem.reel.episodes[part];
        if (!ep) return null;
        const live = Math.abs(i - active) <= 1;
        return (
          <section
            key={feedItem.reel.id}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            data-index={i}
            className="flex h-full w-full snap-start snap-always items-center justify-center"
            aria-label={`${feedItem.book.title}: ${ep.title}`}
          >
            <div
              className="relative h-full w-full select-none overflow-hidden bg-[#05070d] sm:aspect-[9/16] sm:h-[calc(100%-32px)] sm:w-auto sm:rounded-[24px]"
              onClick={() => tap(i)}
            >
              <ReelStage
                key={ep.id}
                episode={ep}
                getTime={isActive ? getTime : openingFrame}
                animate={isActive}
                live={live}
                captionsOn={captionsOn && isActive}
                showProgress={isActive}
                topInset="max(8px,env(safe-area-inset-top))"
                onShotChange={isActive ? (index) => setMood(ep.shots[index]?.mood ?? null) : undefined}
              />

              <p className="pointer-events-none absolute left-16 right-3 top-[calc(max(8px,env(safe-area-inset-top))+22px)] truncate text-[12px] font-medium text-white/80 sm:left-4">
                {feedItem.totalParts > 1 ? `Part ${part + 1} of ${feedItem.totalParts} · ` : ""}
                {ep.title}
              </p>

              {/* Right rail */}
              <div className="absolute bottom-24 right-2 flex flex-col items-center gap-4">
                <Link
                  href={`/books/${feedItem.book.slug}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex flex-col items-center gap-0.5 text-[10px] font-medium text-white/85 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,.6))]"
                >
                  <BookOpen className="h-6 w-6" />
                  Read
                </Link>
                {feedItem.reel.episodes.length > 1 && (
                  <RailButton
                    label="Parts"
                    onClick={() =>
                      setPartsOpen((open) => (open === feedItem.reel.id ? null : feedItem.reel.id))
                    }
                    icon={<ListVideo className="h-6 w-6" />}
                  />
                )}
                <RailButton
                  label="Captions"
                  onClick={() => setCaptionsOn((v) => !v)}
                  icon={captionsOn ? <Captions className="h-6 w-6" /> : <CaptionsOff className="h-6 w-6" />}
                />
                {feedItem.reel.music && (
                  <RailButton
                    label={musicOn ? "Music" : "Muted"}
                    onClick={() => setMusicOn((v) => !v)}
                    icon={<Music2 className={cn("h-6 w-6", !musicOn && "opacity-45")} />}
                  />
                )}
                <RailButton
                  label="Share"
                  onClick={() => void share(feedItem)}
                  icon={<Share2 className="h-6 w-6" />}
                />
              </div>

              <div className="pointer-events-none absolute bottom-6 left-4 right-16 space-y-1 text-white">
                <p className="truncate text-[15px] font-semibold">{feedItem.book.title}</p>
                <p className="truncate text-[12px] text-white/75">
                  by {feedItem.book.author}
                  {feedItem.reel.voiceName ? ` · Narrated by ${feedItem.reel.voiceName}` : ""}
                </p>
                {isActive && mood && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium capitalize backdrop-blur-sm">
                    <Music2 className="h-3 w-3" />
                    {mood}
                  </span>
                )}
              </div>

              {isActive && !playing && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
                    <Play className="ml-1 h-7 w-7 fill-white text-white" />
                  </span>
                  {!unlocked && (
                    <span className="rounded-full bg-black/45 px-3 py-1 text-[12px] font-medium text-white backdrop-blur-sm">
                      Tap to play with sound
                    </span>
                  )}
                </div>
              )}

              {partsOpen === feedItem.reel.id && (
                <div
                  className="absolute inset-x-0 bottom-0 max-h-[60%] overflow-y-auto rounded-t-2xl bg-[#0b1220]/95 p-3 text-white backdrop-blur-md"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-white/60">
                    Parts
                  </p>
                  {feedItem.reel.episodes.map((partEp, p) => (
                    <button
                      key={partEp.id}
                      type="button"
                      onClick={() => pickPart(feedItem.reel.id, p)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-[13px] hover:bg-white/10",
                        p === part && "bg-white/10"
                      )}
                    >
                      {partEp.shots[0]?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={partEp.shots[0].imageUrl} alt="" className="h-12 w-[27px] shrink-0 rounded object-cover" />
                      ) : (
                        <span className="h-12 w-[27px] shrink-0 rounded bg-white/10" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{partEp.title}</span>
                      <span className="text-[11px] tabular-nums text-white/60">
                        {formatReelTime(partEp.durationMs ?? 0)}
                      </span>
                    </button>
                  ))}
                  {feedItem.totalParts > feedItem.reel.episodes.length && (
                    <Link
                      href={`/books/${feedItem.book.slug}`}
                      className="mt-1 block rounded-lg px-2 py-2 text-[13px] font-medium text-[#ffd84d] hover:bg-white/10"
                    >
                      {feedItem.totalParts - feedItem.reel.episodes.length} more parts on the book page
                    </Link>
                  )}
                </div>
              )}
            </div>
          </section>
        );
      })}

      {status === "ready" && items.length > 0 && (
        <div className="flex h-24 snap-end items-center justify-center text-[12px] text-white/50">
          {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : "You're all caught up"}
        </div>
      )}
    </div>
  );
}
