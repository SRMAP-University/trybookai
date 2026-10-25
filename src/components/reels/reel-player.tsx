"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Captions,
  CaptionsOff,
  ChevronDown,
  ChevronUp,
  ListVideo,
  Music2,
  Play,
  Share2,
  X,
} from "lucide-react";
import { BackgroundScorePlayer } from "@/components/dashboard/background-score";
import { holdTawkHidden } from "@/components/tawk-visibility";
import {
  RailButton,
  ReelStage,
  formatReelTime as formatTime,
} from "@/components/reels/reel-stage";
import { cn } from "@/lib/utils";
import { shotIndexAt, type ReelView } from "@/lib/reel-generator/types";

/**
 * Full-screen vertical player. The narration <audio> is the only clock: the
 * current shot, its camera move and the highlighted caption word are all
 * computed from its position, so pausing, seeking and buffering stay in sync.
 */
export function ReelPlayer({
  reel,
  startEpisode,
  onClose,
  onShare,
}: {
  reel: ReelView;
  startEpisode?: number;
  onClose: () => void;
  onShare?: () => void;
}) {
  const episodes = useMemo(
    () => reel.episodes.filter((e) => e.status === "COMPLETED" && e.audioUrl),
    [reel.episodes]
  );
  const [index, setIndex] = useState(() =>
    Math.max(0, episodes.findIndex((e) => e.number === startEpisode))
  );
  const episode = episodes[index] ?? null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ms, setMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const autoplayNext = useRef(false);
  const touchStart = useRef<number | null>(null);
  const swiped = useRef(false);

  // Mood music mixed live under the narration.
  const scoreRef = useRef<BackgroundScorePlayer | null>(null);
  useEffect(() => {
    if (!reel.music) return;
    if (scoreRef.current) scoreRef.current.setScore(reel.music);
    else scoreRef.current = new BackgroundScorePlayer(reel.music);
  }, [reel.music]);
  useEffect(() => () => scoreRef.current?.dispose(), []);
  useEffect(() => {
    scoreRef.current?.setEnabled(musicOn);
  }, [musicOn]);

  // The stage reads the audio clock every frame; the scrubber below only needs
  // the audio's timeupdate events.
  const getTime = useCallback(() => (audioRef.current?.currentTime ?? 0) * 1000, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const releaseChat = holdTawkHidden();
    return () => {
      document.body.style.overflow = previous;
      releaseChat();
    };
  }, []);

  function syncMusic(el: HTMLAudioElement) {
    if (episode) scoreRef.current?.sync(episode.number, el.currentTime, !el.paused && !el.ended);
  }

  function goTo(next: number, autoplay = playing) {
    if (next < 0 || next >= episodes.length || next === index) return;
    autoplayNext.current = autoplay;
    setIndex(next);
    setMs(0);
    setListOpen(false);
  }

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      scoreRef.current?.unlock();
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }

  function seek(toMs: number) {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = toMs / 1000;
    setMs(toMs);
    syncMusic(el);
  }

  // Keyboard: space plays, arrows seek and change videos, Escape closes.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    keyHandler.current = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== "range") return;
      if (e.key === "Escape") onClose();
      else if (e.key === " " || e.key === "k") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") seek(Math.min((episode?.durationMs ?? 0) - 100, ms + 5000));
      else if (e.key === "ArrowLeft") seek(Math.max(0, ms - 5000));
      else if (e.key === "ArrowDown") goTo(index + 1);
      else if (e.key === "ArrowUp") goTo(index - 1);
    };
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const shots = episode?.shots ?? [];
  const current = shots.length ? shotIndexAt(shots, ms) : 0;

  const duration = episode?.durationMs ?? 0;
  const mood = shots[current]?.mood;

  if (!episode) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-6 text-center text-white">
        <div>
          <p className="text-[15px] font-medium">Nothing to play yet.</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#0a2540]"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black sm:bg-black/90 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${reel.title}: ${episode.title}`}
    >
      <audio
        key={episode.id}
        ref={audioRef}
        src={episode.audioUrl ?? undefined}
        preload="auto"
        onLoadedData={(e) => {
          if (autoplayNext.current) {
            autoplayNext.current = false;
            void e.currentTarget.play().catch(() => undefined);
          }
        }}
        onPlay={(e) => {
          setPlaying(true);
          syncMusic(e.currentTarget);
        }}
        onPause={(e) => {
          setPlaying(false);
          setMs(e.currentTarget.currentTime * 1000);
          syncMusic(e.currentTarget);
        }}
        onTimeUpdate={(e) => {
          setMs(e.currentTarget.currentTime * 1000);
          syncMusic(e.currentTarget);
        }}
        onEnded={(e) => {
          setPlaying(false);
          syncMusic(e.currentTarget);
          if (index < episodes.length - 1) goTo(index + 1, true);
        }}
      />

      <div
        className="relative h-full w-full select-none overflow-hidden bg-black sm:aspect-[9/16] sm:h-[min(calc(100dvh-32px),920px)] sm:w-auto sm:rounded-[28px]"
        onClick={() => {
          if (swiped.current) {
            swiped.current = false;
            return;
          }
          togglePlay();
        }}
        onTouchStart={(e) => {
          touchStart.current = e.touches[0]?.clientY ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current;
          const end = e.changedTouches[0]?.clientY;
          touchStart.current = null;
          if (start == null || end == null) return;
          const dy = end - start;
          if (Math.abs(dy) < 60) return;
          swiped.current = true;
          goTo(dy < 0 ? index + 1 : index - 1);
        }}
      >
        <ReelStage key={episode.id} episode={episode} getTime={getTime} captionsOn={captionsOn} />

        <div className="absolute inset-x-3 top-[max(24px,calc(env(safe-area-inset-top)+12px))] flex items-center justify-between gap-3">
          <p className="truncate text-[12px] font-medium text-white/80">
            {episodes.length > 1 ? `${index + 1} / ${episodes.length} · ` : ""}
            {episode.title}
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close player"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/55"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Right rail */}
        <div className="absolute bottom-28 right-2 flex flex-col items-center gap-4">
          {episodes.length > 1 && (
            <RailButton
              label="Chapters"
              onClick={() => setListOpen((v) => !v)}
              icon={<ListVideo className="h-6 w-6" />}
            />
          )}
          <RailButton
            label="Captions"
            onClick={() => setCaptionsOn((v) => !v)}
            icon={captionsOn ? <Captions className="h-6 w-6" /> : <CaptionsOff className="h-6 w-6" />}
          />
          {reel.music && (
            <RailButton
              label={musicOn ? "Music" : "Muted"}
              onClick={() => setMusicOn((v) => !v)}
              icon={<Music2 className={cn("h-6 w-6", !musicOn && "opacity-45")} />}
            />
          )}
          {onShare && (
            <RailButton label="Share" onClick={onShare} icon={<Share2 className="h-6 w-6" />} />
          )}
        </div>

        <div className="pointer-events-none absolute bottom-14 left-4 right-16 space-y-1 text-white">
          <p className="truncate text-[14px] font-semibold">{reel.title}</p>
          <p className="truncate text-[12px] text-white/75">
            {reel.voiceName ? `Narrated by ${reel.voiceName}` : episode.title}
          </p>
          {mood && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium capitalize backdrop-blur-sm">
              <Music2 className="h-3 w-3" />
              {mood}
            </span>
          )}
        </div>

        {/* Scrubber */}
        <div
          className="absolute inset-x-0 bottom-0 px-3 pb-[max(6px,env(safe-area-inset-bottom))]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-0.5 flex justify-between text-[10px] tabular-nums text-white/70">
            <span>{formatTime(ms)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(1, duration)}
            step={100}
            value={Math.min(ms, duration)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek"
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-[#ffd84d]"
          />
        </div>

        {!playing && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
              <Play className="ml-1 h-7 w-7 fill-white text-white" />
            </span>
          </div>
        )}

        {listOpen && (
          <div
            className="absolute inset-x-0 bottom-0 max-h-[60%] overflow-y-auto rounded-t-3xl bg-[#0b1220]/95 p-3 text-white backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-white/60">
              Videos
            </p>
            {episodes.map((ep, i) => (
              <button
                key={ep.id}
                type="button"
                onClick={() => goTo(i, true)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-[13px] hover:bg-white/10",
                  i === index && "bg-white/10"
                )}
              >
                {ep.shots[0]?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ep.shots[0].imageUrl} alt="" className="h-12 w-[27px] shrink-0 rounded object-cover" />
                ) : (
                  <span className="h-12 w-[27px] shrink-0 rounded bg-white/10" />
                )}
                <span className="min-w-0 flex-1 truncate">{ep.title}</span>
                <span className="text-[11px] tabular-nums text-white/60">
                  {formatTime(ep.durationMs ?? 0)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: previous / next video */}
      {episodes.length > 1 && (
        <div className="absolute right-6 top-1/2 hidden -translate-y-1/2 flex-col gap-3 sm:flex">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label="Previous video"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={index === episodes.length - 1}
            aria-label="Next video"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      )}

      <span className="sr-only" aria-live="polite">
        {playing ? "" : "Paused"}
      </span>
    </div>
  );
}
