"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  Ellipsis,
  LayoutGrid,
  Link2,
  Link2Off,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { readJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  formatReelSeconds,
  reelStyle,
  type ReelAllowance,
  type ReelShotView,
  type ReelStreamEvent,
  type ReelView,
} from "@/lib/reel-generator/types";
import { CreateReelDialog, type ReelChapterOption } from "@/components/reels/create-reel-dialog";
import { ReelPlayer } from "@/components/reels/reel-player";
import { Storyboard } from "@/components/reels/storyboard";

function parseSseChunk(buffer: string): { events: ReelStreamEvent[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: ReelStreamEvent[] = [];
  for (const part of parts) {
    const data = part
      .split("\n")
      .find((line) => line.startsWith("data: "))
      ?.slice(6);
    if (!data) continue;
    try {
      events.push(JSON.parse(data) as ReelStreamEvent);
    } catch {
      /* skip malformed */
    }
  }
  return { events, rest };
}

function formatDuration(ms: number | null) {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function isRunning(reel: ReelView) {
  return reel.status === "PENDING" || reel.status === "GENERATING";
}

/**
 * Story Reels on the book page: the book's reels with live progress, plus the
 * create dialog, full-screen player and storyboard.
 */
export function StoryReelPanel({
  bookId,
  bookTitle,
  chapters,
  createOpen,
  onCreateOpenChange,
}: {
  bookId: string;
  bookTitle: string;
  chapters: ReelChapterOption[];
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const [reels, setReels] = useState<ReelView[]>([]);
  const [allowance, setAllowance] = useState<ReelAllowance | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [player, setPlayer] = useState<{ reelId: string; episode?: number } | null>(null);
  const [board, setBoard] = useState<{ reelId: string; episode?: number } | null>(null);
  const watching = useRef(new Set<string>());
  const reelsRef = useRef(reels);
  useEffect(() => {
    reelsRef.current = reels;
  }, [reels]);
  const refreshTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const fetchReels = useCallback(async () => {
    const res = await fetch(`/api/reels?bookId=${encodeURIComponent(bookId)}`, { cache: "no-store" });
    const result = await readJson<{ reels: ReelView[]; allowance: ReelAllowance }>(res);
    return result.ok ? result.data : null;
  }, [bookId]);

  const patchReel = useCallback((id: string, fn: (reel: ReelView) => ReelView) => {
    setReels((prev) => prev.map((r) => (r.id === id ? fn(r) : r)));
  }, []);

  const refreshReel = useCallback(
    async (id: string): Promise<ReelView | null> => {
      const res = await fetch(`/api/reels/${id}`, { cache: "no-store" });
      const result = await readJson<{ reel: ReelView }>(res);
      if (!result.ok) return null;
      patchReel(id, () => result.data.reel);
      return result.data.reel;
    },
    [patchReel]
  );

  /** Coalesce bursts of shot events into one refresh. */
  const scheduleRefresh = useCallback(
    (id: string) => {
      if (refreshTimers.current.has(id)) return;
      refreshTimers.current.set(
        id,
        setTimeout(() => {
          refreshTimers.current.delete(id);
          void refreshReel(id);
        }, 1200)
      );
    },
    [refreshReel]
  );

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const timers = refreshTimers.current;
    return () => {
      mounted.current = false;
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const watch = useCallback(
    async function watchReel(reelId: string, retry = false, attempt = 0): Promise<void> {
      if (watching.current.has(reelId)) return;
      watching.current.add(reelId);
      let finished = false;
      try {
        const res = await fetch(`/api/reels/${reelId}/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ retry }),
        });
        if (!res.ok || !res.body) {
          finished = true;
          const result = await readJson(res);
          if (!result.ok) toast.error(result.error);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = parseSseChunk(buffer);
          buffer = rest;
          for (const event of events) {
            if (event.type === "phase") {
              patchReel(reelId, (r) => ({ ...r, phase: event.message }));
            } else if (event.type === "progress") {
              patchReel(reelId, (r) => ({ ...r, progress: event.progress, status: event.status }));
            } else if (event.type === "shot_done") {
              const known = reelsRef.current
                .find((r) => r.id === reelId)
                ?.episodes.some((ep) => ep.shots.some((s) => s.id === event.shotId));
              if (!known) {
                // Shot lists are planned after the page loaded; fetch them.
                scheduleRefresh(reelId);
                continue;
              }
              patchReel(reelId, (r) => ({
                ...r,
                episodes: r.episodes.map((ep) =>
                  ep.number !== event.episodeNumber
                    ? ep
                    : {
                        ...ep,
                        shots: ep.shots.map((s) =>
                          s.id === event.shotId
                            ? { ...s, imageUrl: event.imageUrl, status: event.status }
                            : s
                        ),
                      }
                ),
              }));
            } else if (event.type === "episode_done") {
              scheduleRefresh(reelId);
            } else if (event.type === "done") {
              finished = true;
              await refreshReel(reelId);
              toast.success("Your reel is ready to watch");
            } else if (event.type === "error") {
              finished = true;
              await refreshReel(reelId);
              toast.error(event.message);
            }
          }
        }
      } catch {
        /* connection dropped; the job keeps running on the server */
      } finally {
        watching.current.delete(reelId);
      }
      // The stream closes at the server's time limit while the reel is still
      // being made; reconnecting also restarts a job that stopped with it.
      const latest = await refreshReel(reelId).catch(() => null);
      if (!finished && mounted.current && latest && isRunning(latest) && attempt < 30) {
        setTimeout(() => void watchReel(reelId, false, attempt + 1), 1500);
      }
    },
    [patchReel, refreshReel, scheduleRefresh]
  );

  // Load the book's reels and follow any still being made, including after a reload.
  useEffect(() => {
    let cancelled = false;
    fetchReels()
      .then((data) => {
        if (cancelled || !data) return;
        setReels(data.reels);
        setAllowance(data.allowance);
        for (const reel of data.reels) if (isRunning(reel)) void watch(reel.id);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchReels, watch]);

  function onShotChange(reelId: string, episodeNumber: number, shot: ReelShotView) {
    patchReel(reelId, (r) => ({
      ...r,
      episodes: r.episodes.map((ep) =>
        ep.number === episodeNumber
          ? { ...ep, shots: ep.shots.map((s) => (s.id === shot.id ? shot : s)) }
          : ep
      ),
    }));
  }

  async function share(reel: ReelView) {
    const res = await fetch(`/api/reels/${reel.id}/share`, { method: "POST" });
    const result = await readJson<{ shareToken: string; url: string }>(res);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    patchReel(reel.id, (r) => ({ ...r, shareToken: result.data.shareToken }));
    const { url } = result.data;
    if (typeof navigator !== "undefined" && navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title: reel.title, url }).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied");
    } catch {
      toast.message("Share link", { description: url });
    }
  }

  async function stopSharing(reel: ReelView) {
    const res = await fetch(`/api/reels/${reel.id}/share`, { method: "DELETE" });
    if (res.ok) {
      patchReel(reel.id, (r) => ({ ...r, shareToken: null }));
      toast.success("Share link turned off");
    } else {
      toast.error("Couldn't turn off the link");
    }
  }

  async function remove(reel: ReelView) {
    if (!window.confirm(`Delete "${reel.title}"? Its share link stops working.`)) return;
    const res = await fetch(`/api/reels/${reel.id}`, { method: "DELETE" });
    const result = await readJson(res);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setReels((prev) => prev.filter((r) => r.id !== reel.id));
    toast.success("Reel deleted");
  }

  function retry(reel: ReelView) {
    patchReel(reel.id, (r) => ({ ...r, status: "GENERATING", errorMessage: null }));
    void watch(reel.id, true);
  }

  const playerReel = player ? reels.find((r) => r.id === player.reelId) : null;
  const boardReel = board ? reels.find((r) => r.id === board.reelId) : null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#0a2540]">Story Reels</h2>
          {allowance && (
            <span className="text-[12px] text-[#697386]">
              {formatReelSeconds(allowance.remainingSeconds)} of{" "}
              {formatReelSeconds(allowance.limitSeconds)} left this month
            </span>
          )}
        </div>
        {reels.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-full border-transparent bg-[#f6f9fc] px-3.5 text-[12px] hover:bg-[#eef0f5]"
            onClick={() => onCreateOpenChange(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            New reel
          </Button>
        )}
      </div>

      {!loaded ? (
        <div className="h-28 animate-pulse rounded-2xl bg-[#f6f9fc]" />
      ) : reels.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-3xl bg-[#f7f8fb] p-5 sm:flex-row sm:items-center">
          <div className="relative h-[92px] w-[110px] shrink-0" aria-hidden>
            <span className="absolute left-1 top-3 h-[76px] w-[43px] -rotate-[8deg] rounded-md bg-linear-to-br from-[#1d2b4f] to-[#c27a3a] shadow-md" />
            <span className="absolute left-[34px] top-0 h-[82px] w-[46px] rounded-md bg-linear-to-br from-[#0b2d36] to-[#36e0a5] shadow-lg" />
            <span className="absolute left-[64px] top-4 h-[74px] w-[42px] rotate-[9deg] rounded-md bg-linear-to-br from-[#2b1a0d] to-[#ffb84f] shadow-md" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-[#0a2540]">Make TikTok-style videos from your book</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[#697386]">
              A narrator reads each chapter in about a minute, a new illustration appears for every
              scene, and captions follow the voice. Watch here or share a link.
            </p>
          </div>
          <Button
            className="h-9 shrink-0 rounded-full bg-[#635bff] px-4 text-[13px] hover:bg-[#5851e5]"
            onClick={() => onCreateOpenChange(true)}
          >
            <Clapperboard className="mr-1.5 h-4 w-4" />
            Make a reel
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {reels.map((reel) => {
            const running = isRunning(reel);
            const ready = reel.episodes.filter((e) => e.status === "COMPLETED");
            const shotsTotal = reel.episodes.reduce((n, e) => n + e.shots.length, 0);
            const shotsDone = reel.episodes.reduce(
              (n, e) => n + e.shots.filter((s) => s.imageUrl).length,
              0
            );
            return (
              <article key={reel.id} className="rounded-2xl bg-white p-4 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-[#0a2540]">{reel.title}</p>
                    <p className="mt-0.5 text-[12px] text-[#697386]">
                      {reelStyle(reel.stylePreset).label} ·{" "}
                      {reel.episodes.length} {reel.episodes.length === 1 ? "video" : "videos"}
                      {reel.voiceName ? ` · ${reel.voiceName}` : ""}
                      {reel.shareToken ? " · Shared" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {ready.length > 0 && (
                      <Button
                        size="sm"
                        className="h-8 rounded-full bg-[#635bff] px-3.5 text-[12px] hover:bg-[#5851e5]"
                        onClick={() => setPlayer({ reelId: reel.id, episode: ready[0].number })}
                      >
                        <Play className="mr-1 h-3.5 w-3.5" />
                        Play
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 rounded-full p-0" aria-label="Reel actions">
                          <Ellipsis className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-44">
                        <DropdownMenuItem onSelect={() => setBoard({ reelId: reel.id })}>
                          <LayoutGrid className="h-4 w-4" />
                          Storyboard
                        </DropdownMenuItem>
                        {ready.length > 0 && (
                          <DropdownMenuItem onSelect={() => void share(reel)}>
                            <Link2 className="h-4 w-4" />
                            {reel.shareToken ? "Copy share link" : "Share link"}
                          </DropdownMenuItem>
                        )}
                        {reel.shareToken && (
                          <DropdownMenuItem onSelect={() => void stopSharing(reel)}>
                            <Link2Off className="h-4 w-4" />
                            Turn off link
                          </DropdownMenuItem>
                        )}
                        {reel.status === "FAILED" && (
                          <DropdownMenuItem onSelect={() => retry(reel)}>
                            <RotateCcw className="h-4 w-4" />
                            Retry
                          </DropdownMenuItem>
                        )}
                        {!running && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => void remove(reel)}
                              className="text-[#df1b41] focus:text-[#df1b41]"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {running && (
                  <div className="mt-3">
                    <Progress value={reel.progress} className="h-1.5" />
                    <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#697386]">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {reel.phase ?? "Starting…"}
                      {shotsTotal > 0 && (
                        <span className="tabular-nums">
                          · {shotsDone} of {shotsTotal} shots drawn
                        </span>
                      )}
                    </p>
                  </div>
                )}

                {reel.status === "FAILED" && reel.errorMessage && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#fde8e8]/60 px-3 py-2">
                    <p className="text-[12px] text-[#df1b41]">{reel.errorMessage}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full border-[#f5c2cc] text-[12px]"
                      onClick={() => retry(reel)}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Retry
                    </Button>
                  </div>
                )}

                <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2">
                  {reel.episodes.map((episode) => {
                    const poster = episode.shots.find((s) => s.imageUrl)?.imageUrl;
                    const done = episode.status === "COMPLETED";
                    const drawn = episode.shots.filter((s) => s.imageUrl).length;
                    return (
                      <button
                        key={episode.id}
                        type="button"
                        onClick={() =>
                          done
                            ? setPlayer({ reelId: reel.id, episode: episode.number })
                            : setBoard({ reelId: reel.id, episode: episode.number })
                        }
                        className="group relative aspect-[9/16] overflow-hidden rounded-xl bg-[#0a2540] text-left"
                        aria-label={`${done ? "Play" : "View"} ${episode.title}`}
                      >
                        {poster ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={poster}
                            alt=""
                            className={cn(
                              "h-full w-full object-cover transition-transform duration-300 group-hover:scale-105",
                              !done && "opacity-60"
                            )}
                          />
                        ) : (
                          <span
                            className={cn(
                              "block h-full w-full bg-linear-to-br from-[#1a3a5c] to-[#0a2540]",
                              running && "animate-pulse"
                            )}
                          />
                        )}
                        <span className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
                        <span className="absolute bottom-1 left-1.5 text-[10px] font-semibold text-white">
                          {reel.format === "TRAILER" ? "Trailer" : `Ch ${episode.number}`}
                        </span>
                        <span className="absolute bottom-1 right-1.5 text-[10px] tabular-nums text-white/85">
                          {done
                            ? formatDuration(episode.durationMs)
                            : episode.status === "FAILED"
                              ? "Failed"
                              : episode.shots.length
                                ? `${drawn}/${episode.shots.length}`
                                : ""}
                        </span>
                        {done && (
                          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/45">
                              <Play className="ml-0.5 h-4 w-4 fill-white text-white" />
                            </span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <CreateReelDialog
        open={createOpen}
        onOpenChange={onCreateOpenChange}
        bookId={bookId}
        bookTitle={bookTitle}
        chapters={chapters}
        allowance={allowance}
        onCreated={(reel) => {
          setReels((prev) => [reel, ...prev.filter((r) => r.id !== reel.id)]);
          void watch(reel.id);
          void fetchReels().then((data) => data && setAllowance(data.allowance));
        }}
      />

      {playerReel && (
        <ReelPlayer
          key={`${playerReel.id}-${player?.episode ?? 0}`}
          reel={playerReel}
          startEpisode={player?.episode}
          onClose={() => setPlayer(null)}
          onShare={() => void share(playerReel)}
        />
      )}

      {boardReel && (
        <Storyboard
          key={boardReel.id}
          reel={boardReel}
          open
          onOpenChange={(open) => !open && setBoard(null)}
          initialEpisode={board?.episode}
          maxRerolls={allowance?.maxRerolls ?? 3}
          onShotChange={(episodeNumber, shot) => onShotChange(boardReel.id, episodeNumber, shot)}
          onPlay={(episodeNumber) => {
            setBoard(null);
            setPlayer({ reelId: boardReel.id, episode: episodeNumber });
          }}
        />
      )}
    </section>
  );
}
