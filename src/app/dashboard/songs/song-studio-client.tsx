"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Loader2,
  MicVocal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BookAudioPanel,
  type BookAudioItem,
} from "@/components/dashboard/book-audio-panel";
import { useDashboardUser } from "@/components/dashboard/user-context";
import { UpgradeLink } from "@/components/dashboard/upgrade-button";
import { cn } from "@/lib/utils";
import { SONG_STYLE_PRESETS } from "@/lib/song-studio";

type StudioProject = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  audios: BookAudioItem[];
};

function parseSseChunk(buffer: string): {
  events: { type: string; data: Record<string, unknown> }[];
  rest: string;
} {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: { type: string; data: Record<string, unknown> }[] = [];

  for (const part of parts) {
    const lines = part.split("\n");
    let eventType = "message";
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("event:")) eventType = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) continue;
    try {
      events.push({
        type: eventType,
        data: JSON.parse(dataLines.join("\n")) as Record<string, unknown>,
      });
    } catch {
      // ignore malformed chunks
    }
  }

  return { events, rest };
}

function statusLabel(status: string) {
  switch (status) {
    case "COMPLETED":
      return "Ready";
    case "GENERATING":
    case "PENDING":
      return "Generating";
    case "FAILED":
      return "Failed";
    default:
      return status.toLowerCase();
  }
}

function statusTone(status: string) {
  switch (status) {
    case "COMPLETED":
      return "bg-[#cbf4c9] text-[#0e6245]";
    case "GENERATING":
    case "PENDING":
      return "bg-[#ebe9ff] text-[#635bff]";
    case "FAILED":
      return "bg-[#fde2e4] text-[#df1b41]";
    default:
      return "bg-[#f6f9fc] text-[#697386]";
  }
}

export function SongStudioClient() {
  const { user, refresh: refreshUser } = useDashboardUser();
  const searchParams = useSearchParams();
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState("Pop");
  const [mood, setMood] = useState("");
  const [prompt, setPrompt] = useState("");
  const [promptHydrated, setPromptHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [audios, setAudios] = useState<BookAudioItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [phaseMessage, setPhaseMessage] = useState<string | null>(null);
  const audioWatchingRef = useRef(false);
  const playerRef = useRef<HTMLDivElement>(null);

  const audioLocked = user?.plan === "FREE" && !user?.onTrial;
  const audioRemaining = user
    ? Math.max(0, (user.audioMinutesLimit ?? 0) - (user.audioMinutesUsed ?? 0))
    : 0;
  const audioLimit = user?.audioMinutesLimit ?? 0;
  const audioUsedPercent =
    audioLimit > 0
      ? Math.min(100, Math.round(((user?.audioMinutesUsed ?? 0) / audioLimit) * 100))
      : 0;

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/song");
      if (!res.ok) return;
      const data = (await res.json()) as { projects: StudioProject[] };
      setProjects(data.projects ?? []);
    } catch {
      // ignore
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (promptHydrated) return;
    const fromQuery = searchParams.get("prompt");
    if (fromQuery?.trim()) {
      setPrompt(fromQuery.trim().slice(0, 4000));
    }
    setPromptHydrated(true);
  }, [promptHydrated, searchParams]);

  async function refreshActiveAudios(bookId: string | null) {
    if (!bookId) return;
    const res = await fetch(`/api/audio?bookId=${bookId}`);
    if (!res.ok) return;
    const data = (await res.json()) as { audios: BookAudioItem[] };
    setAudios(data.audios ?? []);
  }

  async function handleAudioStreamEvent(
    evt: { type: string; data: Record<string, unknown> },
    audioId: string,
    bookId: string
  ) {
    const d = evt.data;

    if (evt.type === "phase") {
      setPhaseMessage((d.message as string) ?? null);
    }

    if (evt.type === "progress") {
      setAudios((prev) =>
        prev.map((a) =>
          a.id === audioId
            ? {
                ...a,
                progress: (d.progress as number) ?? a.progress,
                status: (d.status as string) ?? a.status,
              }
            : a
        )
      );
    }

    if (evt.type === "track_done") {
      const trackNumber = d.trackNumber as number | undefined;
      const trackTitle = d.trackTitle as string | undefined;
      const audioUrl = d.audioUrl as string | undefined;
      if (trackNumber != null && trackTitle && audioUrl) {
        setAudios((prev) =>
          prev.map((a) => {
            if (a.id !== audioId) return a;
            const without = a.tracks.filter((t) => t.number !== trackNumber);
            return {
              ...a,
              status: "GENERATING",
              tracks: [
                ...without,
                {
                  id: `temp-${audioId}-${trackNumber}`,
                  number: trackNumber,
                  title: trackTitle,
                  audioUrl,
                },
              ].sort((x, y) => x.number - y.number),
            };
          })
        );
      }
    }

    if (evt.type === "done") {
      toast.success("Song ready");
      setGenerating(false);
      setPhaseMessage(null);
      refreshUser();
      await refreshActiveAudios(bookId);
      await loadProjects();
    }

    if (evt.type === "error") {
      throw new Error((d.message as string) ?? "Song generation failed");
    }
  }

  async function subscribeToAudio(audioId: string, bookId: string) {
    if (audioWatchingRef.current) return;
    audioWatchingRef.current = true;

    try {
      const res = await fetch(`/api/audio/${audioId}/stream`, {
        method: "POST",
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "Song stream failed"
        );
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
        for (const evt of events) {
          await handleAudioStreamEvent(evt, audioId, bookId);
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Song generation failed"
      );
    } finally {
      audioWatchingRef.current = false;
      setGenerating(false);
      setPhaseMessage(null);
      await refreshActiveAudios(bookId);
      await loadProjects();
      refreshUser();
    }
  }

  async function handleGenerate() {
    if (audioLocked) {
      toast.error("Songs require Pro, Premium, or an active trial.");
      return;
    }
    if (!title.trim()) {
      toast.error("Add a song title.");
      return;
    }
    if (prompt.trim().length < 12) {
      toast.error("Describe the song or paste lyrics (at least a sentence).");
      return;
    }

    setBusy(true);
    setGenerating(true);
    setPhaseMessage("Starting song…");

    try {
      const res = await fetch("/api/studio/song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          style,
          mood: mood.trim() || undefined,
          prompt: prompt.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Could not start Song Studio"
        );
      }

      const bookId = (data as { bookId: string }).bookId;
      const audio = (data as { audio: BookAudioItem }).audio;
      setActiveBookId(bookId);
      setAudios([{ ...audio, tracks: audio.tracks ?? [] }]);
      await loadProjects();
      requestAnimationFrame(() => {
        playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      if ((data as { completed?: boolean }).completed) {
        toast.success("Song already ready");
        setGenerating(false);
        setPhaseMessage(null);
        return;
      }

      toast.success("Writing and generating a song…");
      await subscribeToAudio(audio.id, bookId);
    } catch (error) {
      setGenerating(false);
      setPhaseMessage(null);
      toast.error(
        error instanceof Error ? error.message : "Could not start generation"
      );
    } finally {
      setBusy(false);
    }
  }

  function openProject(project: StudioProject) {
    setActiveBookId(project.id);
    setAudios(project.audios ?? []);
    const inProgress = project.audios.find(
      (a) => a.status === "GENERATING" || a.status === "PENDING"
    );
    if (inProgress) {
      setGenerating(true);
      void subscribeToAudio(inProgress.id, project.id);
    }
  }

  const showPlayer = audios.length > 0 || generating;
  const promptHint = useMemo(
    () => `${prompt.trim().length} / 4000`,
    [prompt]
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            Song Studio
          </h1>
          <p className="mt-1 max-w-lg text-[14px] text-[#697386]">
            Generate an original vocal song from a title, style, and brief. This
            is separate from books and audiobooks.
          </p>
        </div>
        {!audioLocked && user && (
          <div className="min-w-[200px] rounded-lg border border-[#e6ebf1] bg-white px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span className="text-[#697386]">Audio left</span>
              <span className="tabular-nums font-medium text-[#0a2540]">
                {audioRemaining}
                <span className="font-normal text-[#a3acb9]">
                  {" "}
                  / {audioLimit} min
                </span>
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e6ebf1]">
              <div
                className="h-full rounded-full bg-[#635bff] transition-[width]"
                style={{ width: `${audioUsedPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {audioLocked && (
        <div className="rounded-lg border border-[#e6ebf1] bg-[#f6f9fc] px-4 py-3 text-[13px] text-[#425466]">
          Song generation is available on Pro, Premium, or during a Premium
          trial.{" "}
          <UpgradeLink
            plan="PRO"
            className="font-medium text-[#635bff] hover:underline"
          >
            Upgrade
          </UpgradeLink>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="overflow-hidden rounded-xl border border-[#e6ebf1] bg-white">
          <div className="border-b border-[#e6ebf1] px-5 py-4 sm:px-6">
            <p className="text-[13px] font-medium text-[#0a2540]">New song</p>
            <p className="mt-0.5 text-[12px] text-[#697386]">
              About 90 seconds · uses 2 minutes of audio quota
            </p>
          </div>
          <div className="space-y-5 px-5 py-5 sm:px-6">
            <div>
              <Label className="text-[13px] text-[#0a2540]">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Song title"
                className="mt-2 h-10 border-[#e6ebf1]"
                maxLength={200}
              />
            </div>
            <div>
              <Label className="text-[13px] text-[#0a2540]">Style</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {SONG_STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setStyle(preset)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                      style === preset
                        ? "border-[#635bff] bg-[#f0efff] text-[#635bff]"
                        : "border-[#e6ebf1] text-[#425466] hover:border-[#c9c5ff]"
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-[13px] text-[#0a2540]">Mood</Label>
              <Input
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                placeholder="Hopeful, dark, romantic…"
                className="mt-2 h-10 border-[#e6ebf1]"
                maxLength={80}
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-[13px] text-[#0a2540]">
                  Brief or lyrics
                </Label>
                <span className="text-[11px] text-[#a3acb9]">{promptHint}</span>
              </div>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value.slice(0, 4000))}
                placeholder="What the song is about, or paste verse/chorus lyrics…"
                className="mt-2 min-h-[140px] border-[#e6ebf1]"
              />
            </div>
            <Button
              onClick={() => void handleGenerate()}
              disabled={busy || audioLocked}
              className="h-11 w-full bg-[#635bff] text-white hover:bg-[#4b44d4]"
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MicVocal className="mr-2 h-4 w-4" />
              )}
              Generate song
            </Button>
          </div>
        </section>

        <aside className="space-y-3">
          <p className="text-[13px] font-medium text-[#0a2540]">Your songs</p>
          {loadingProjects ? (
            <p className="text-[13px] text-[#697386]">Loading…</p>
          ) : projects.length === 0 ? (
            <p className="text-[13px] text-[#697386]">
              Songs you generate will show up here.
            </p>
          ) : (
            <ul className="space-y-2">
              {projects.map((project) => {
                const audio = project.audios[0];
                const status = audio?.status ?? project.status;
                return (
                  <li key={project.id}>
                    <button
                      type="button"
                      onClick={() => openProject(project)}
                      className={cn(
                        "w-full rounded-xl border px-3.5 py-3 text-left transition-colors",
                        activeBookId === project.id
                          ? "border-[#635bff] bg-[#f8f7ff]"
                          : "border-[#e6ebf1] bg-white hover:border-[#c9c5ff]"
                      )}
                    >
                      <span className="block text-[13px] font-medium text-[#0a2540]">
                        {project.title}
                      </span>
                      <span
                        className={cn(
                          "mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                          statusTone(status)
                        )}
                      >
                        {statusLabel(status)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>

      {showPlayer && (
        <div ref={playerRef}>
          <BookAudioPanel
            audios={audios}
            generatingType={generating ? "SONG" : null}
            phaseMessage={phaseMessage}
          />
        </div>
      )}
    </div>
  );
}
