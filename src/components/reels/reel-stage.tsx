"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ScoreMood } from "@/lib/audio-generator/score-types";
import {
  captionChunks,
  chunkIndexAt,
  shotIndexAt,
  type ReelEpisodeView,
  type ReelMotion,
} from "@/lib/reel-generator/types";

const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOutExpo = (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));

/** Camera move over a shot, `p` from 0 (shot starts) to 1 (shot ends), eased. */
export function motionTransform(motion: ReelMotion, rawP: number): string {
  const p = easeInOut(Math.min(1, Math.max(0, rawP)));
  switch (motion) {
    case "pull-out":
      return `scale(${1.2 - 0.16 * p})`;
    case "pan-left":
      return `scale(1.18) translateX(${5 - 10 * p}%)`;
    case "pan-right":
      return `scale(1.18) translateX(${-5 + 10 * p}%)`;
    case "rise":
      return `scale(1.16) translateY(${-5 + 10 * p}%)`;
    case "tilt-down":
      return `scale(1.16) translateY(${5 - 10 * p}%)`;
    case "drift":
      return `scale(${1.12 + 0.08 * p}) translate(${-3 + 6 * p}%, ${2 - 4 * p}%)`;
    case "punch-in": {
      // A fast zoom on the cut, then a slow creep.
      const punch = easeOutExpo(Math.min(1, rawP * 3));
      return `scale(${1.24 - 0.12 * punch + 0.04 * rawP})`;
    }
    default:
      return `scale(${1.04 + 0.16 * p})`;
  }
}

/** Moods that get a slight handheld sway. */
const HANDHELD: ReadonlySet<ScoreMood> = new Set(["suspense", "action", "dark", "mystery"]);

/** How fast pictures change into a shot of this mood: near-cuts for action, slow dissolves for quiet. */
function transitionMs(mood: ScoreMood | undefined): number {
  switch (mood) {
    case "action":
    case "suspense":
    case "triumph":
      return 140;
    case "calm":
    case "sad":
    case "warm":
    case "wonder":
      return 700;
    default:
      return 320;
  }
}

export function formatReelTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

const CAPTION_SHADOW =
  "0 2px 0 rgba(0,0,0,.55), 0 0 14px rgba(0,0,0,.55), 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000";

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='.55'/></svg>\")";

/**
 * The picture side of a reel. Camera moves, progress and the spoken caption
 * word follow `getTime` (the narration clock) every frame. Per-frame motion is
 * written straight to the elements; React re-renders only when the shot or
 * the highlighted word changes, which keeps phones at a smooth frame rate.
 * With `live` off it shows the opening frame only.
 */
export function ReelStage({
  episode,
  getTime,
  animate = true,
  live = true,
  captionsOn = true,
  topInset = "max(12px,env(safe-area-inset-top))",
  showProgress = false,
  onShotChange,
}: {
  episode: ReelEpisodeView;
  /** Current narration position in ms. */
  getTime: () => number;
  /** Run the frame loop (only the reel in view needs it). */
  animate?: boolean;
  live?: boolean;
  captionsOn?: boolean;
  topInset?: string;
  showProgress?: boolean;
  onShotChange?: (index: number) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const shots = episode.shots;
  const words = episode.captions;
  const chunks = useMemo(() => captionChunks(words), [words]);
  const duration = Math.max(1, episode.durationMs ?? 1);

  const [current, setCurrent] = useState(0);
  const [caption, setCaption] = useState({ chunk: -1, word: -1 });

  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const fillRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const currentRef = useRef(-1);
  const captionRef = useRef({ chunk: -1, word: -1 });
  const shotChangeRef = useRef(onShotChange);
  useEffect(() => {
    shotChangeRef.current = onShotChange;
  }, [onShotChange]);

  useEffect(() => {
    if (!live) return;
    let raf = 0;
    let lastT = Number.NaN;

    const shotProgress = (i: number, t: number) => {
      const shot = shots[i];
      if (!shot || shot.startMs == null || shot.endMs == null) return 0;
      return Math.min(1, Math.max(0, (t - shot.startMs) / Math.max(1, shot.endMs - shot.startMs)));
    };

    const paint = () => {
      const t = animate ? getTime() : 0;
      if (t === lastT) return;
      lastT = t;

      const index = shots.length ? shotIndexAt(shots, t) : 0;
      if (index !== currentRef.current) {
        currentRef.current = index;
        setCurrent(index);
        shotChangeRef.current?.(index);
      }

      for (let i = Math.max(0, index - 1); i <= Math.min(shots.length - 1, index + 1); i++) {
        const el = imgRefs.current[i];
        const shot = shots[i];
        if (!el || !shot) continue;
        let transform = motionTransform(shot.motion, reduced ? 0.5 : shotProgress(i, t));
        if (!reduced && HANDHELD.has(shot.mood)) {
          const x = Math.sin(t / 640) * 0.35 + Math.sin(t / 233) * 0.08;
          const y = Math.cos(t / 820) * 0.3;
          const r = Math.sin(t / 1100) * 0.18;
          transform += ` translate(${x}%, ${y}%) rotate(${r}deg)`;
        }
        el.style.transform = transform;
      }

      const fill = fillRefs.current[index];
      if (fill) fill.style.transform = `scaleX(${shotProgress(index, t)})`;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${Math.min(1, t / duration)})`;

      const chunkIndex = chunkIndexAt(chunks, t);
      let word = -1;
      if (chunkIndex >= 0) {
        const chunk = chunks[chunkIndex];
        for (let i = chunk.first; i <= chunk.last; i++) if (words[i][1] <= t) word = i;
      }
      if (chunkIndex !== captionRef.current.chunk || word !== captionRef.current.word) {
        captionRef.current = { chunk: chunkIndex, word };
        setCaption(captionRef.current);
      }
    };

    const loop = () => {
      paint();
      if (animate) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [live, animate, getTime, shots, chunks, words, duration, reduced]);

  const chunk = caption.chunk >= 0 ? chunks[caption.chunk] : null;
  const fadeMs = reduced ? 0 : transitionMs(shots[current]?.mood);

  return (
    <>
      {shots.map((shot, i) =>
        shot.imageUrl && (live || i === 0) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={shot.id}
            ref={(el) => {
              imgRefs.current[i] = el;
            }}
            src={shot.imageUrl}
            alt=""
            draggable={false}
            loading={live ? "eager" : "lazy"}
            decoding="async"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover will-change-transform"
            style={{
              opacity: i === current ? 1 : 0,
              transitionProperty: "opacity",
              transitionDuration: `${fadeMs}ms`,
              transitionTimingFunction: "ease-out",
              transform: i === 0 ? motionTransform(shot.motion, 0) : undefined,
            }}
          />
        ) : null
      )}

      {/* Vignette and moving film grain keep still pictures from feeling flat. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,.45)_100%)]" />
      {live && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-[10%] opacity-[0.08] mix-blend-overlay animate-[reel-grain_0.5s_steps(4)_infinite] motion-reduce:animate-none"
          style={{ backgroundImage: GRAIN }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,.5),transparent_18%,transparent_55%,rgba(0,0,0,.7))]" />

      <div className="pointer-events-none absolute inset-x-3 flex gap-[3px]" style={{ top: topInset }}>
        {shots.map((shot, i) => (
          <span key={shot.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <span
              ref={(el) => {
                fillRefs.current[i] = el;
              }}
              className="block h-full origin-left bg-white"
              style={{ transform: `scaleX(${i < current ? 1 : 0})` }}
            />
          </span>
        ))}
      </div>

      {captionsOn && chunk && (
        <p
          className="pointer-events-none absolute inset-x-4 top-[58%] pr-12 text-center text-[22px] font-extrabold leading-[1.2] tracking-[-0.01em] text-white sm:text-[26px]"
          style={{ textShadow: CAPTION_SHADOW }}
          aria-hidden
        >
          {words.slice(chunk.first, chunk.last + 1).map((word, i) => (
            <span
              key={chunk.first + i}
              className={cn(
                "mx-[0.12em] inline-block transition-transform duration-100",
                chunk.first + i === caption.word && "scale-[1.1] text-[#ffd84d]"
              )}
            >
              {word[0]}
            </span>
          ))}
        </p>
      )}

      {showProgress && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
          <div ref={progressRef} className="h-full origin-left scale-x-0 bg-[#ffd84d]" />
        </div>
      )}
    </>
  );
}

export function RailButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex flex-col items-center gap-0.5 text-[10px] font-medium text-white/85 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,.6))]"
    >
      {icon}
      {label}
    </button>
  );
}
