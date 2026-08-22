"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Headphones,
  Mic2,
  MicVocal,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { AudioDerivativeType } from "@/components/dashboard/book-derivatives-dialog";

export type BookAudioTrack = {
  id: string;
  number: number;
  title: string;
  audioUrl: string;
  durationMs?: number | null;
};

export type BookAudioItem = {
  id: string;
  type: AudioDerivativeType;
  status: string;
  progress: number;
  title: string | null;
  voiceName: string | null;
  audioUrl: string | null;
  errorMessage: string | null;
  tracks: BookAudioTrack[];
};

const TYPE_META: Record<
  AudioDerivativeType,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
    accent: string;
  }
> = {
  AUDIOBOOK: {
    label: "Audiobook",
    icon: Headphones,
    tone: "text-[#0e6245] bg-[#cbf4c9]",
    accent: "#0e6245",
  },
  PODCAST: {
    label: "Podcast",
    icon: Mic2,
    tone: "text-[#635bff] bg-[#ebe9ff]",
    accent: "#635bff",
  },
  MUSIC: {
    label: "Theme music",
    icon: Music2,
    tone: "text-[#9a6700] bg-[#fcf5e0]",
    accent: "#9a6700",
  },
  SONG: {
    label: "Song",
    icon: MicVocal,
    tone: "text-[#df1b41] bg-[#fde8e8]",
    accent: "#df1b41",
  },
};

function safeFilename(name: string) {
  return name.replace(/[^\w\s.-]+/g, "").trim().replace(/\s+/g, "-") || "track";
}

function downloadUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".mp3") ? filename : `${filename}.mp3`;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function AudioCard({
  audio,
  isGenerating,
  phaseMessage,
}: {
  audio: BookAudioItem;
  isGenerating: boolean;
  phaseMessage: string | null;
}) {
  const meta = TYPE_META[audio.type];
  const tracks = useMemo(
    () => [...audio.tracks].sort((a, b) => a.number - b.number),
    [audio.tracks]
  );
  const progress = Math.round(audio.progress || 0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  /** Real length in seconds — from DB / file size, never browser metadata. */
  const [duration, setDuration] = useState(0);

  const track = tracks[index] ?? null;
  const trackKey = tracks.map((t) => t.id).join("|");
  const seekMax = duration > 0 ? duration : 0.1;

  useEffect(() => {
    if (index >= tracks.length && tracks.length > 0) {
      setIndex(tracks.length - 1);
    }
  }, [tracks.length, index]);

  // Resolve accurate duration from stored durationMs or server file-size estimate.
  // Do NOT use HTMLAudioElement.duration — CDN MP3 metadata is often wrong (~14:11).
  useEffect(() => {
    if (!track) {
      setDuration(0);
      return;
    }

    let cancelled = false;

    if (track.durationMs && track.durationMs > 0) {
      setDuration(track.durationMs / 1000);
      return;
    }

    setDuration(0);
    void fetch(`/api/audio/tracks/${track.id}/duration`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { durationMs?: number };
        if (!cancelled && data.durationMs && data.durationMs > 0) {
          setDuration(data.durationMs / 1000);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [track?.id, track?.durationMs]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !track) return;
    const wasPlaying = playing;
    el.src = track.audioUrl;
    el.preload = "metadata";
    el.load();
    setCurrentTime(0);

    if (wasPlaying) {
      void el.play().catch(() => setPlaying(false));
    }
    // Only reload when the selected track changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, trackKey]);

  function togglePlay() {
    const el = audioRef.current;
    if (!el || !track) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    void el
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }

  function playTrack(nextIndex: number) {
    setIndex(nextIndex);
    setPlaying(true);
    requestAnimationFrame(() => {
      const el = audioRef.current;
      if (!el) return;
      void el.play().catch(() => setPlaying(false));
    });
  }

  function seek(value: number) {
    const el = audioRef.current;
    if (!el || !(duration > 0)) return;
    el.currentTime = Math.min(Math.max(0, value), duration);
    setCurrentTime(el.currentTime);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#e6ebf1] bg-white">
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => {
          if (index < tracks.length - 1) {
            playTrack(index + 1);
          } else {
            setPlaying(false);
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      {audio.status === "FAILED" && audio.errorMessage && (
        <p className="px-4 py-2 text-[12px] text-[#df1b41]">
          {audio.errorMessage}
        </p>
      )}

      {isGenerating && (
        <div className="space-y-2 px-4 py-4">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="min-w-0 font-medium text-[#0a2540]">
              {phaseMessage || `Generating ${meta.label.toLowerCase()}…`}
            </span>
            <span className="shrink-0 tabular-nums text-[#697386]">
              {progress}%
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-[12px] text-[#697386]">
            {tracks.length > 0
              ? `${tracks.length} chapter${tracks.length === 1 ? "" : "s"} ready — play or download while the rest generate.`
              : "Chapter audio will appear here as narration finishes."}
          </p>
        </div>
      )}

      {track && (
        <div className="border-t border-[#e6ebf1] bg-[#f6f9fc] px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#697386]">
                Now playing · {meta.label}
              </p>
              <p className="mt-1 truncate text-[15px] font-semibold text-[#0a2540]">
                {track.number}. {track.title}
              </p>
              <p className="mt-0.5 text-[12px] text-[#697386]">
                Track {index + 1} of {tracks.length}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-9 text-white hover:opacity-90"
              style={{ backgroundColor: meta.accent }}
              onClick={togglePlay}
            >
              {playing ? (
                <Pause className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Play className="mr-1.5 h-3.5 w-3.5" />
              )}
              {playing ? "Pause" : "Play"}
            </Button>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              className="rounded-md p-1.5 text-[#697386] hover:bg-white hover:text-[#0a2540] disabled:opacity-40"
              onClick={() => playTrack(Math.max(0, index - 1))}
              disabled={index === 0}
              aria-label="Previous track"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm"
              style={{ backgroundColor: meta.accent }}
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 translate-x-0.5" />
              )}
            </button>
            <button
              type="button"
              className="rounded-md p-1.5 text-[#697386] hover:bg-white hover:text-[#0a2540] disabled:opacity-40"
              onClick={() => playTrack(Math.min(tracks.length - 1, index + 1))}
              disabled={index >= tracks.length - 1}
              aria-label="Next track"
            >
              <SkipForward className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1">
              <input
                type="range"
                min={0}
                max={seekMax}
                step={0.1}
                value={Math.min(currentTime, seekMax)}
                onChange={(e) => seek(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#e6ebf1]"
                style={{ accentColor: meta.accent }}
              />
              <div className="mt-1 flex justify-between text-[11px] tabular-nums text-[#697386]">
                <span>{formatTime(currentTime)}</span>
                <span>{duration > 0 ? formatTime(duration) : "--:--"}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tracks.length > 0 && (
        <div className="divide-y divide-[#e6ebf1] border-t border-[#e6ebf1]">
          {tracks.map((t, i) => (
            <div
              key={t.id}
              className={cn(
                "flex flex-wrap items-center gap-3 px-4 py-3",
                i === index && "bg-[#f6f9fc]"
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[#0a2540]">
                  {t.number}. {t.title}
                </p>
                <p className="text-[11px] text-[#a3acb9]">MP3 · ready</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-[#e6ebf1] text-[12px]"
                  onClick={() => {
                    if (playing && i === index) {
                      togglePlay();
                      return;
                    }
                    playTrack(i);
                  }}
                >
                  {playing && i === index ? (
                    <Pause className="mr-1 h-3.5 w-3.5" />
                  ) : (
                    <Play className="mr-1 h-3.5 w-3.5" />
                  )}
                  {playing && i === index ? "Pause" : "Play"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-[#e6ebf1] text-[12px]"
                  onClick={() =>
                    downloadUrl(
                      t.audioUrl,
                      `${safeFilename(`${t.number}-${t.title}`)}.mp3`
                    )
                  }
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {audio.status === "COMPLETED" &&
        tracks.length === 0 &&
        audio.audioUrl && (
          <div className="flex flex-wrap items-center gap-3 border-t border-[#e6ebf1] px-4 py-3">
            <audio
              controls
              preload="none"
              className="h-9 w-full max-w-md"
              src={audio.audioUrl}
            >
              <track kind="captions" />
            </audio>
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-[#e6ebf1]"
              onClick={() =>
                downloadUrl(
                  audio.audioUrl!,
                  `${safeFilename(audio.title ?? meta.label)}.mp3`
                )
              }
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download
            </Button>
          </div>
        )}
    </div>
  );
}

const CREATE_OPTIONS: {
  type: AudioDerivativeType;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    type: "AUDIOBOOK",
    label: "Audiobook",
    hint: "Narrate every chapter",
    icon: Headphones,
  },
  {
    type: "PODCAST",
    label: "Podcast",
    hint: "Episode from the story",
    icon: Mic2,
  },
  {
    type: "MUSIC",
    label: "Theme music",
    hint: "Instrumental intro",
    icon: Music2,
  },
];

type BookAudioPanelProps = {
  audios: BookAudioItem[];
  generatingType?: AudioDerivativeType | null;
  phaseMessage?: string | null;
  onOpenStudio?: () => void;
  onPickType?: (type: AudioDerivativeType) => void;
  /** Public book pages — play only, no studio / generate controls. */
  readOnly?: boolean;
};

function CreateTypeGrid({
  missing,
  onPickType,
}: {
  missing: AudioDerivativeType[];
  onPickType: (type: AudioDerivativeType) => void;
}) {
  const options = CREATE_OPTIONS.filter((o) => missing.includes(o.type));
  if (options.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.type}
            type="button"
            onClick={() => onPickType(option.type)}
            className="flex items-start gap-3 rounded-xl border border-[#e6ebf1] bg-white px-3.5 py-3 text-left transition-colors hover:border-[#635bff]/40 hover:bg-[#f8f7ff]"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#635bff]" />
            <span>
              <span className="block text-[13px] font-semibold text-[#0a2540]">
                {option.label}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-[#697386]">
                {option.hint}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function BookAudioPanel({
  audios,
  generatingType = null,
  phaseMessage = null,
  onOpenStudio,
  onPickType,
  readOnly = false,
}: BookAudioPanelProps) {
  const playable = useMemo(() => {
    const list = readOnly
      ? audios.filter(
          (a) =>
            a.status === "COMPLETED" &&
            (a.tracks.length > 0 || Boolean(a.audioUrl))
        )
      : audios;
    return [...list].sort((a, b) => {
      const order = { AUDIOBOOK: 0, PODCAST: 1, MUSIC: 2, SONG: 3 };
      return order[a.type] - order[b.type];
    });
  }, [audios, readOnly]);

  const missingTypes = useMemo(() => {
    const have = new Set(
      audios
        .filter((a) => a.status !== "FAILED")
        .map((a) => a.type)
    );
    return CREATE_OPTIONS.map((o) => o.type).filter((t) => !have.has(t));
  }, [audios]);

  if (playable.length === 0 && !generatingType) {
    if (readOnly) return null;
    return (
      <div className="rounded-xl border border-[#e6ebf1] bg-white p-5">
        <div className="mb-4">
          <p className="text-[15px] font-semibold text-[#0a2540]">Audio</p>
          <p className="mt-1 text-[13px] text-[#697386]">
            Audiobook, podcast, or theme music.
          </p>
        </div>
        {onPickType ? (
          <CreateTypeGrid missing={missingTypes} onPickType={onPickType} />
        ) : onOpenStudio ? (
          <Button
            onClick={onOpenStudio}
            className="bg-[#635bff] text-white hover:bg-[#4b44d4]"
          >
            Open audio studio
          </Button>
        ) : null}
      </div>
    );
  }

  if (playable.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-[#0a2540]">
            {readOnly ? "Listen" : "Audio"}
          </p>
          <p className="mt-1 text-[13px] text-[#697386]">
            {readOnly
              ? "Play the audiobook, podcast, theme, or song for this book."
              : "Live progress, player, and downloads"}
          </p>
        </div>
        {!readOnly && onOpenStudio && missingTypes.length === 0 && (
          <Button
            variant="outline"
            onClick={onOpenStudio}
            className="border-[#e6ebf1] text-[#0a2540]"
          >
            Audio studio
          </Button>
        )}
      </div>

      {playable.map((audio) => {
        const showProgress =
          !readOnly &&
          (audio.status === "GENERATING" ||
            audio.status === "PENDING" ||
            (generatingType === audio.type &&
              audio.status !== "COMPLETED" &&
              audio.status !== "FAILED"));

        return (
          <AudioCard
            key={audio.id}
            audio={audio}
            isGenerating={showProgress}
            phaseMessage={
              generatingType === audio.type ? phaseMessage : null
            }
          />
        );
      })}

      {!readOnly && onPickType && missingTypes.length > 0 && (
        <div className="rounded-xl border border-dashed border-[#e6ebf1] bg-[#fafbfc] p-4">
          <p className="mb-3 text-[13px] font-medium text-[#0a2540]">
            Create more audio
          </p>
          <CreateTypeGrid missing={missingTypes} onPickType={onPickType} />
        </div>
      )}
    </div>
  );
}
