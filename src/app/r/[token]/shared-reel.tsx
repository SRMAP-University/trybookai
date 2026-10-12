"use client";

import { useState } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { ReelPlayer } from "@/components/reels/reel-player";
import type { ReelView } from "@/lib/reel-generator/types";

function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Poster with a play button; the full-screen player opens on tap. */
export function SharedReel({
  reel,
  poster,
  bookTitle,
  bookUrl,
}: {
  reel: ReelView;
  poster: string | null;
  bookTitle: string;
  bookUrl: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  const totalMs = reel.episodes.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
  const hasVideos = reel.episodes.length > 0;

  async function share() {
    const url = window.location.href;
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title: reel.title, url }).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.message("Share link", { description: url });
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#05070d] px-4 py-10 text-white">
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-2xl"
        />
      )}
      {/* Keeps white text readable over light posters. */}
      <div aria-hidden className="absolute inset-0 bg-linear-to-b from-[#05070d]/30 via-[#05070d]/60 to-[#05070d]/85" />

      <div className="relative flex w-full max-w-[360px] flex-col items-center gap-5 text-center">
        <button
          type="button"
          disabled={!hasVideos}
          onClick={() => setPlaying(true)}
          className="group relative aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-[24px] bg-[#0a2540] shadow-[0_30px_80px_-20px_rgba(0,0,0,.8)] disabled:cursor-default"
          aria-label={`Play ${reel.title}`}
        >
          {poster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          )}
          <span className="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-black/20" />
          {hasVideos && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-md transition-transform group-hover:scale-110">
                <Play className="ml-1 h-7 w-7 fill-white text-white" />
              </span>
            </span>
          )}
          <span className="absolute bottom-3 left-3 right-3 text-left text-[12px] text-white/85">
            {reel.episodes.length} {reel.episodes.length === 1 ? "video" : "videos"} ·{" "}
            {formatDuration(totalMs)}
          </span>
        </button>

        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-balance text-white">
            {reel.title}
          </h1>
          <p className="mt-1 text-[13px] text-white/65">
            {hasVideos
              ? `A narrated, illustrated story from ${bookTitle}.`
              : "This reel is still being made. Check back in a few minutes."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {bookUrl && (
            <Link
              href={bookUrl}
              className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#0a2540] hover:bg-white/90"
            >
              Read the book
            </Link>
          )}
          <button
            type="button"
            onClick={share}
            className="rounded-full border border-white/25 px-4 py-2 text-[13px] font-medium text-white hover:bg-white/10"
          >
            Share
          </button>
        </div>

        <p className="text-[12px] text-white/55">
          Made with{" "}
          <Link href="/" className="font-medium text-white/85 underline-offset-2 hover:underline">
            BookAI
          </Link>
          {" · "}
          <Link href="/register" className="font-medium text-white/85 underline-offset-2 hover:underline">
            Turn your book into a reel
          </Link>
        </p>
      </div>

      {playing && <ReelPlayer reel={reel} onClose={() => setPlaying(false)} onShare={share} />}
    </main>
  );
}
