"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { readJson } from "@/lib/api";
import type { IllustrationStatus } from "@/lib/book-illustrations/status";

type Props = {
  bookId: string;
  enabled: boolean;
  /** At least one chapter is written, so pictures can be drawn */
  canIllustrate: boolean;
  /** The manuscript is still being written */
  generating: boolean;
  /** Called when more chapters have their pictures, to reload the chapter text */
  onPicturesAdded: () => void;
};

const BUSY_POLL_MS = 4_000;

export function IllustrationsPanel({
  bookId,
  enabled,
  canIllustrate,
  generating,
  onPicturesAdded,
}: Props) {
  const [status, setStatus] = useState<IllustrationStatus | null>(null);
  const [starting, setStarting] = useState(false);
  // Bumped to restart polling after the user starts or retries.
  const [pollKey, setPollKey] = useState(0);
  const placedRef = useRef<number | null>(null);
  const onAddedRef = useRef(onPicturesAdded);
  useEffect(() => {
    onAddedRef.current = onPicturesAdded;
  });

  useEffect(() => {
    if (!enabled && !canIllustrate) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      const res = await fetch(`/api/books/${bookId}/illustrations`, { cache: "no-store" }).catch(
        () => null
      );
      if (cancelled || !res) return;
      const json = await readJson<IllustrationStatus>(res);
      if (cancelled || !json.ok) return;
      const next = json.data;
      setStatus(next);
      if (placedRef.current != null && next.chaptersDone > placedRef.current) {
        onAddedRef.current();
      }
      placedRef.current = next.chaptersDone;
      // Keep watching while pictures are being drawn or chapters are still being written.
      if (next.enabled && (next.running || next.actionable || generating)) {
        timer = setTimeout(load, BUSY_POLL_MS);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [bookId, enabled, canIllustrate, generating, pollKey]);

  async function start(retry = false) {
    setStarting(true);
    try {
      const res = await fetch(`/api/books/${bookId}/illustrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retry }),
      });
      const json = await readJson<IllustrationStatus>(res);
      if (!json.ok) {
        toast.error(json.error);
        return;
      }
      setStatus(json.data);
      setPollKey((k) => k + 1);
    } finally {
      setStarting(false);
    }
  }

  if (!enabled && !canIllustrate) return null;

  const on = status?.enabled ?? enabled;
  const working = Boolean(status && (status.running || status.actionable));
  const total = status?.chaptersTotal ?? 0;
  const done = status?.chaptersDone ?? 0;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#0a2540]">Illustrations</h2>
          {on && status && status.ready > 0 && (
            <span className="text-[12px] text-[#697386]">
              {status.ready} {status.ready === 1 ? "picture" : "pictures"} · {done} of {total}{" "}
              {total === 1 ? "chapter" : "chapters"}
            </span>
          )}
        </div>
      </div>

      {!status ? (
        <div className="h-24 animate-pulse rounded-2xl bg-[#f6f9fc]" />
      ) : !on ? (
        <div className="flex flex-col items-start gap-4 rounded-2xl bg-[#f6f9fc] p-5 sm:flex-row sm:items-center">
          <div className="relative h-[84px] w-[118px] shrink-0" aria-hidden>
            <span className="absolute left-0 top-4 h-[58px] w-[82px] -rotate-[6deg] rounded-md bg-linear-to-br from-[#2b3d55] to-[#c9d3dd] shadow-md" />
            <span className="absolute left-[30px] top-0 h-[62px] w-[86px] rotate-[4deg] rounded-md bg-linear-to-br from-[#3a2a1c] to-[#e0a96d] shadow-lg" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-[#0a2540]">Add pictures to this book</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[#697386]">
              A picture at the top of every chapter and at its key scenes, with characters that look
              the same throughout. Your text stays as it is.
            </p>
          </div>
          <Button
            className="h-9 shrink-0 rounded-full bg-[#635bff] px-4 text-[13px] hover:bg-[#5851e5]"
            disabled={starting}
            onClick={() => void start()}
          >
            {starting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="mr-1.5 h-4 w-4" />
            )}
            Illustrate this book
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl bg-white p-4 shadow-soft">
          {working || (generating && done < total) || total === 0 ? (
            <div>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="flex items-center gap-2 font-medium text-[#0a2540]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#635bff]" />
                  {working
                    ? `Drawing pictures${total ? ` for chapter ${Math.min(done + 1, total)} of ${total}` : ""}`
                    : "Pictures are added as each chapter is finished"}
                </span>
                {total > 0 && (
                  <span className="tabular-nums text-[12px] text-[#697386]">
                    {Math.round((done / total) * 100)}%
                  </span>
                )}
              </div>
              <Progress value={total ? (done / total) * 100 : 0} className="mt-2.5 h-1.5" />
            </div>
          ) : status.failed > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-[#425466]">
                {status.failed} {status.failed === 1 ? "picture" : "pictures"} couldn&apos;t be drawn.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-full border-transparent bg-[#f6f9fc] px-3 text-[12px] hover:bg-[#eef0f5]"
                disabled={starting}
                onClick={() => void start(true)}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Try again
              </Button>
            </div>
          ) : (
            <p className="text-[13px] text-[#425466]">Every chapter has its pictures.</p>
          )}

          {status.openers.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {status.openers.slice(0, 6).map((opener) => (
                <div
                  key={opener.number}
                  className="group relative overflow-hidden rounded-lg bg-[#eef2f7]"
                  title={`Chapter ${opener.number}: ${opener.title}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={opener.imageUrl}
                    alt={`Chapter ${opener.number}`}
                    loading="lazy"
                    className="aspect-[3/2] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <span className="absolute bottom-1 left-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {opener.number}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
