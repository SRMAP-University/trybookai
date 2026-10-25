"use client";

import { useState } from "react";
import { Loader2, Pencil, Play, RefreshCw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { readJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  MOTION_LABELS,
  REEL_MOTIONS,
  type ReelMotion,
  type ReelShotView,
  type ReelView,
} from "@/lib/reel-generator/types";

function formatTime(ms: number | null) {
  if (ms == null) return "–";
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

type ShotEdit = { description?: string; motion?: ReelMotion; redraw?: boolean; undo?: boolean };

/**
 * Every shot of a reel's videos with the narration it covers. Re-rolling or
 * re-describing a shot redraws only that image; the audio never changes.
 */
export function Storyboard({
  reel,
  open,
  onOpenChange,
  initialEpisode,
  maxRerolls,
  onShotChange,
  onPlay,
}: {
  reel: ReelView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEpisode?: number;
  maxRerolls: number;
  onShotChange: (episodeNumber: number, shot: ReelShotView) => void;
  onPlay: (episodeNumber: number) => void;
}) {
  const [episodeNumber, setEpisodeNumber] = useState(
    initialEpisode ?? reel.episodes[0]?.number ?? 1
  );
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const episode = reel.episodes.find((e) => e.number === episodeNumber) ?? reel.episodes[0];
  if (!episode) return null;

  const ready = episode.status === "COMPLETED";
  const rerollsUsed = episode.shots.reduce((sum, s) => sum + s.rerolls, 0);
  const rerollsLeft = Math.max(0, maxRerolls - rerollsUsed);

  async function edit(shot: ReelShotView, body: ShotEdit) {
    setBusy((b) => ({ ...b, [shot.id]: true }));
    try {
      const res = await fetch(`/api/reels/${reel.id}/shots/${shot.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await readJson<{ shot: ReelShotView }>(res);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onShotChange(episode.number, result.data.shot);
      if (body.description != null) setEditing(null);
    } catch {
      toast.error("Couldn't update the shot. Check your connection.");
    } finally {
      setBusy((b) => ({ ...b, [shot.id]: false }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[min(92dvh,860px)] flex-col gap-0 overflow-hidden bg-white p-0 sm:max-w-[960px]"
      >
        <div className="bg-[#f6f9fc] px-5 pb-3 pt-5 sm:px-6">
          <DialogTitle className="pr-8 text-[17px] font-semibold tracking-[-0.02em] text-[#0a2540]">
            Storyboard
          </DialogTitle>
          <DialogDescription className="mt-1 text-[13px] text-[#697386]">
            Redraw any shot without changing the narration. {rerollsLeft} of {maxRerolls} re-rolls
            left for this video.
          </DialogDescription>

          {reel.episodes.length > 1 && (
            <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 py-1">
              {reel.episodes.map((ep) => (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => {
                    setEpisodeNumber(ep.number);
                    setEditing(null);
                  }}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-[12px] font-medium ring-1 transition-colors",
                    ep.number === episode.number
                      ? "bg-[#f0efff] text-[#635bff] ring-[#635bff]/40"
                      : "bg-white text-[#425466] ring-transparent hover:text-[#0a2540] hover:ring-[#635bff]/20"
                  )}
                >
                  {reel.format === "TRAILER" ? ep.title : `Ch. ${ep.number}`}
                  {ep.status !== "COMPLETED" && (
                    <span className="ml-1 text-[#9aa5b4]">
                      {ep.status === "FAILED" ? "· failed" : "· drawing"}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-3.5 sm:px-6">
          <p className="min-w-0 truncate text-[13px] font-medium text-[#0a2540]">
            {episode.title}
            <span className="ml-2 font-normal text-[#697386]">
              {episode.shots.length} shots · {formatTime(episode.durationMs)}
            </span>
          </p>
          <Button
            size="sm"
            className="h-8 shrink-0 rounded-full bg-[#635bff] px-3.5 text-[12px] hover:bg-[#5851e5]"
            disabled={!ready}
            onClick={() => onPlay(episode.number)}
          >
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Play
          </Button>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-4 overflow-y-auto p-5 sm:grid-cols-3 sm:px-6 lg:grid-cols-4">
          {episode.shots.length === 0 && (
            <p className="col-span-full py-10 text-center text-[13px] text-[#697386]">
              Shots appear here as soon as they’re planned.
            </p>
          )}
          {episode.shots.map((shot) => {
            const isBusy = busy[shot.id] || (!ready && !shot.imageUrl);
            const isEditing = editing?.id === shot.id;
            return (
              <div key={shot.id} className="flex min-w-0 flex-col gap-2">
                <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-[#0a2540]">
                  {shot.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={shot.imageUrl} alt={shot.description} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full animate-pulse bg-linear-to-br from-[#1a3a5c] to-[#0a2540]" />
                  )}
                  {isBusy && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </div>
                  )}
                  <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white">
                    {formatTime(shot.startMs)}–{formatTime(shot.endMs)}
                  </span>
                  {shot.status === "REUSED" && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-[#fcf5e0] px-2 py-0.5 text-[10px] font-semibold text-[#9a6700]">
                      Reused
                    </span>
                  )}
                  {shot.rerolls > 0 && shot.status !== "REUSED" && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-[#ebe9ff] px-2 py-0.5 text-[10px] font-semibold text-[#635bff]">
                      Re-rolled
                    </span>
                  )}
                </div>

                <p className="line-clamp-3 text-[12px] leading-snug text-[#0a2540]">“{shot.text}”</p>

                {isEditing ? (
                  <div className="space-y-1.5">
                    <Textarea
                      value={editing.text}
                      onChange={(e) => setEditing({ id: shot.id, text: e.target.value })}
                      maxLength={400}
                      rows={4}
                      className="text-[12px]"
                      aria-label={`Picture description for shot ${shot.number}`}
                    />
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="h-7 flex-1 rounded-full bg-[#635bff] text-[11px] hover:bg-[#5851e5]"
                        disabled={busy[shot.id] || !editing.text.trim() || rerollsLeft === 0}
                        onClick={() => edit(shot, { description: editing.text })}
                      >
                        Redraw
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-full border-transparent bg-[#f6f9fc] text-[11px] hover:bg-[#eef0f5]"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ShotAction
                      label="Re-roll"
                      icon={<RefreshCw className="h-3 w-3" />}
                      disabled={!ready || busy[shot.id] || rerollsLeft === 0}
                      onClick={() => edit(shot, { redraw: true })}
                    />
                    <ShotAction
                      label="Edit"
                      icon={<Pencil className="h-3 w-3" />}
                      disabled={!ready || busy[shot.id]}
                      onClick={() => setEditing({ id: shot.id, text: shot.description })}
                    />
                    {shot.previousImageUrl && (
                      <ShotAction
                        label="Undo"
                        icon={<Undo2 className="h-3 w-3" />}
                        disabled={!ready || busy[shot.id]}
                        onClick={() => edit(shot, { undo: true })}
                      />
                    )}
                    <select
                      value={shot.motion}
                      disabled={!ready || busy[shot.id]}
                      onChange={(e) => edit(shot, { motion: e.target.value as ReelMotion })}
                      aria-label={`Camera move for shot ${shot.number}`}
                      className="h-6 rounded-md border border-[#e6ebf1] bg-white px-1 text-[11px] text-[#425466] disabled:opacity-50"
                    >
                      {REEL_MOTIONS.map((m) => (
                        <option key={m} value={m}>
                          {MOTION_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShotAction({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-6 items-center gap-1 rounded-full bg-[#f6f9fc] px-2.5 text-[11px] font-medium text-[#0a2540] transition-colors hover:bg-[#eef0f5] disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}
