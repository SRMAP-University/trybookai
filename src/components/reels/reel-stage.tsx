"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  captionChunks,
  chunkIndexAt,
  shotIndexAt,
  type ReelEpisodeView,
  type ReelMotion,
} from "@/lib/reel-generator/types";

/** Camera move over a shot, `p` from 0 (shot starts) to 1 (shot ends). */
export function motionTransform(motion: ReelMotion, p: number): string {
  switch (motion) {
    case "pull-out":
      return `scale(${1.18 - 0.12 * p})`;
    case "pan-left":
      return `scale(1.16) translateX(${4 - 8 * p}%)`;
    case "pan-right":
      return `scale(1.16) translateX(${-4 + 8 * p}%)`;
    case "rise":
      return `scale(1.14) translateY(${-4 + 8 * p}%)`;
    default:
      return `scale(${1.04 + 0.12 * p})`;
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

/**
 * The picture side of a reel at time `ms`: the current shot with its camera
 * move, a crossfade from the previous one, one progress segment per shot, and
 * the caption chunk with the spoken word highlighted. Pure render; the caller
 * owns the clock. With `live` off it shows the opening frame only.
 */
export function ReelStage({
  episode,
  ms,
  captionsOn = true,
  live = true,
  topInset = "max(12px,env(safe-area-inset-top))",
}: {
  episode: ReelEpisodeView;
  ms: number;
  captionsOn?: boolean;
  live?: boolean;
  topInset?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const shots = episode.shots;
  const current = live && shots.length ? shotIndexAt(shots, ms) : 0;
  const shotProgress = (i: number) => {
    const shot = shots[i];
    if (!live || !shot || shot.startMs == null || shot.endMs == null) return 0;
    const span = Math.max(1, shot.endMs - shot.startMs);
    return Math.min(1, Math.max(0, (ms - shot.startMs) / span));
  };

  const chunks = useMemo(() => captionChunks(episode.captions), [episode.captions]);
  const chunkIndex = live ? chunkIndexAt(chunks, ms) : -1;
  const chunk = chunkIndex >= 0 ? chunks[chunkIndex] : null;
  const words = episode.captions;
  let activeWord = -1;
  if (chunk) {
    for (let i = chunk.first; i <= chunk.last; i++) if (words[i][1] <= ms) activeWord = i;
  }

  return (
    <>
      {shots.map((shot, i) =>
        shot.imageUrl && (live || i === 0) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={shot.id}
            src={shot.imageUrl}
            alt=""
            draggable={false}
            loading={live ? "eager" : "lazy"}
            className={cn(
              "pointer-events-none absolute inset-0 h-full w-full object-cover will-change-transform",
              !reduced && "transition-opacity duration-500 ease-out"
            )}
            style={{
              opacity: i === current ? 1 : 0,
              transform:
                Math.abs(i - current) <= 1
                  ? motionTransform(shot.motion, reduced ? 0.5 : shotProgress(i))
                  : undefined,
            }}
          />
        ) : null
      )}

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,.5),transparent_18%,transparent_55%,rgba(0,0,0,.7))]" />

      <div
        className="pointer-events-none absolute inset-x-3 flex gap-1"
        style={{ top: topInset }}
      >
        {shots.map((shot, i) => (
          <span key={shot.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <span
              className="block h-full bg-white"
              style={{ width: `${i < current ? 100 : i === current ? shotProgress(i) * 100 : 0}%` }}
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
                chunk.first + i === activeWord && "scale-[1.08] text-[#ffd84d]"
              )}
            >
              {word[0]}
            </span>
          ))}
        </p>
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
