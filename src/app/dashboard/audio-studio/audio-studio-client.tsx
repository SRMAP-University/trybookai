"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Headphones,
  Loader2,
  Mic2,
  Upload,
  X,
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
import {
  DEFAULT_VOICE_SETTINGS,
  ELEVENLABS_VOICES,
  VOICE_SETTING_PRESETS,
  type VoiceSettingsConfig,
} from "@/lib/elevenlabs-voices";
import { DEFAULT_VOICE_ID } from "@/lib/elevenlabs";
import { cn } from "@/lib/utils";
import { estimateAudioMinutesFromText } from "@/lib/audio-quota";

type StudioProject = {
  id: string;
  title: string;
  status: string;
  currentPages: number;
  createdAt: string;
  updatedAt: string;
  audios: BookAudioItem[];
};

type AudioType = "AUDIOBOOK" | "PODCAST";
type SourceMode = "text" | "pdf";

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

export function AudioStudioClient() {
  const { user, refresh: refreshUser } = useDashboardUser();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>("text");
  const [audioType, setAudioType] = useState<AudioType>("AUDIOBOOK");
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);
  const [settings, setSettings] = useState<VoiceSettingsConfig>(() => ({
    ...DEFAULT_VOICE_SETTINGS,
    ...VOICE_SETTING_PRESETS.find((p) => p.id === "narration")?.settings,
  }));
  const [activePreset, setActivePreset] = useState("narration");
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [audios, setAudios] = useState<BookAudioItem[]>([]);
  const [generatingType, setGeneratingType] = useState<AudioType | null>(null);
  const [phaseMessage, setPhaseMessage] = useState<string | null>(null);
  const audioWatchingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  const selectedVoice = useMemo(
    () => ELEVENLABS_VOICES.find((v) => v.id === voiceId) ?? ELEVENLABS_VOICES[0],
    [voiceId]
  );

  const wordCount = useMemo(
    () => text.trim().split(/\s+/).filter(Boolean).length,
    [text]
  );
  const estimatedMinutes = useMemo(
    () => (text.trim() ? estimateAudioMinutesFromText(text) : 0),
    [text]
  );

  const audioLocked = user?.plan === "FREE" && !user?.onTrial;
  const audioRemaining = user
    ? Math.max(0, (user.audioMinutesLimit ?? 0) - (user.audioMinutesUsed ?? 0))
    : 0;
  const audioLimit = user?.audioMinutesLimit ?? 0;
  const audioUsedPercent =
    audioLimit > 0
      ? Math.min(100, Math.round(((user?.audioMinutesUsed ?? 0) / audioLimit) * 100))
      : 0;

  const showPlayer = audios.length > 0 || Boolean(generatingType);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/audio");
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

  function applyPreset(presetId: string) {
    const preset = VOICE_SETTING_PRESETS.find((p) => p.id === presetId);
    setActivePreset(presetId);
    if (!preset) return;
    setSettings((prev) => ({
      ...DEFAULT_VOICE_SETTINGS,
      ...preset.settings,
      modelId: prev.modelId,
    }));
  }

  function onTypeChange(next: AudioType) {
    setAudioType(next);
    applyPreset(next === "PODCAST" ? "podcast" : "narration");
  }

  function setMode(mode: SourceMode) {
    setSourceMode(mode);
    if (mode === "text") {
      setPdfFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onPdfPicked(file: File | null) {
    if (!file) {
      setPdfFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      toast.error("Please upload a PDF file.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error("PDF must be 12 MB or smaller.");
      return;
    }
    setPdfFile(file);
    setSourceMode("pdf");
    if (!title.trim()) {
      setTitle(file.name.replace(/\.pdf$/i, "").slice(0, 200));
    }
  }

  async function handleAudioStreamEvent(
    evt: { type: string; data: Record<string, unknown> },
    audioId: string,
    bookId: string
  ) {
    const d = evt.data;

    if (evt.type === "phase") {
      setPhaseMessage((d.message as string) ?? null);
      if (d.audioType === "AUDIOBOOK" || d.audioType === "PODCAST") {
        setGeneratingType(d.audioType);
      }
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
      toast.success("Audio ready");
      setGeneratingType(null);
      setPhaseMessage(null);
      refreshUser();
      await refreshActiveAudios(bookId);
      await loadProjects();
    }

    if (evt.type === "error") {
      throw new Error((d.message as string) ?? "Audio generation failed");
    }
  }

  async function refreshActiveAudios(bookId: string | null) {
    if (!bookId) return;
    const res = await fetch(`/api/audio?bookId=${bookId}`);
    if (!res.ok) return;
    const data = (await res.json()) as { audios: BookAudioItem[] };
    setAudios(data.audios ?? []);
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
          (data as { error?: string }).error ?? "Audio stream failed"
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
      const message =
        error instanceof Error ? error.message : "Audio generation failed";
      toast.error(message);
    } finally {
      audioWatchingRef.current = false;
      setGeneratingType(null);
      setPhaseMessage(null);
      await refreshActiveAudios(bookId);
      await loadProjects();
      refreshUser();
    }
  }

  async function handleGenerate() {
    if (audioLocked) {
      toast.error("Audio requires Pro, Premium, or an active trial.");
      return;
    }
    if (!title.trim()) {
      toast.error("Add a title for this project.");
      return;
    }
    if (sourceMode === "pdf" && !pdfFile) {
      toast.error("Choose a PDF, or switch to paste text.");
      return;
    }
    if (sourceMode === "text" && wordCount < 40) {
      toast.error("Paste at least ~40 words, or upload a PDF.");
      return;
    }

    setBusy(true);
    setPhaseMessage("Preparing your manuscript…");
    setGeneratingType(audioType);

    try {
      const form = new FormData();
      form.set("title", title.trim());
      form.set("type", audioType);
      form.set("voiceId", selectedVoice.id);
      form.set("voiceName", selectedVoice.name);
      form.set("voiceSettings", JSON.stringify(settings));
      if (sourceMode === "text" && text.trim()) form.set("text", text.trim());
      if (sourceMode === "pdf" && pdfFile) form.set("file", pdfFile);

      const res = await fetch("/api/studio/audio", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Could not start Audio Studio"
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
        toast.success("Audio already ready");
        setGeneratingType(null);
        setPhaseMessage(null);
        return;
      }

      toast.success(
        audioType === "PODCAST" ? "Recording podcast…" : "Narrating audiobook…"
      );
      await subscribeToAudio(audio.id, bookId);
    } catch (error) {
      setGeneratingType(null);
      setPhaseMessage(null);
      toast.error(
        error instanceof Error ? error.message : "Could not start generation"
      );
    } finally {
      setBusy(false);
    }
  }

  async function openProject(project: StudioProject) {
    setActiveBookId(project.id);
    setTitle(project.title);
    setAudios(project.audios ?? []);
    requestAnimationFrame(() => {
      playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    const inProgress = (project.audios ?? []).find(
      (a) => a.status === "GENERATING" || a.status === "PENDING"
    );
    if (inProgress && (inProgress.type === "AUDIOBOOK" || inProgress.type === "PODCAST")) {
      setGeneratingType(inProgress.type);
      void subscribeToAudio(inProgress.id, project.id);
    }
  }

  function startNew() {
    setActiveBookId(null);
    setAudios([]);
    setGeneratingType(null);
    setPhaseMessage(null);
    setTitle("");
    setText("");
    setPdfFile(null);
    setSourceMode("text");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            Audio Studio
          </h1>
          <p className="mt-1 max-w-lg text-[14px] text-[#697386]">
            Turn pasted text or a PDF into an audiobook or podcast. For original
            songs, use{" "}
            <Link
              href="/dashboard/songs"
              className="font-medium text-[#635bff] hover:underline"
            >
              Song Studio
            </Link>
            .
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
          Audio narration is available on Pro, Premium, or during a Premium
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
            <p className="text-[13px] font-medium text-[#0a2540]">New project</p>
            <p className="mt-0.5 text-[12px] text-[#697386]">
              Source → format → voice → generate
            </p>
          </div>

          <div className="space-y-6 px-5 py-5 sm:px-6">
            <div>
              <Label className="text-[13px] text-[#0a2540]">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Episode title or book name"
                className="mt-2 h-10 border-[#e6ebf1]"
                maxLength={200}
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[13px] text-[#0a2540]">Source</Label>
                <span className="text-[11px] tabular-nums text-[#a3acb9]">
                  {sourceMode === "pdf" && pdfFile
                    ? `${(pdfFile.size / 1024 / 1024).toFixed(1)} MB`
                    : `${wordCount.toLocaleString()} words${
                        estimatedMinutes ? ` · ~${estimatedMinutes} min` : ""
                      }`}
                </span>
              </div>

              <div className="mt-2 inline-flex rounded-lg border border-[#e6ebf1] bg-[#f6f9fc] p-0.5">
                {(
                  [
                    { id: "text" as const, label: "Paste text" },
                    { id: "pdf" as const, label: "Upload PDF" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMode(tab.id)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                      sourceMode === tab.id
                        ? "bg-white text-[#0a2540] shadow-sm"
                        : "text-[#697386] hover:text-[#0a2540]"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {sourceMode === "text" ? (
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste chapters, an article, show notes, or any long-form text…"
                  className="mt-3 min-h-[240px] resize-y border-[#e6ebf1] text-[14px] leading-relaxed"
                />
              ) : (
                <div className="mt-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => onPdfPicked(e.target.files?.[0] ?? null)}
                  />
                  {pdfFile ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#e6ebf1] bg-[#f6f9fc] px-3.5 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-[#635bff]">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-[#0a2540]">
                            {pdfFile.name}
                          </p>
                          <p className="text-[11px] text-[#697386]">
                            Text-based PDFs work best
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPdfFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="rounded-md p-1.5 text-[#697386] hover:bg-white hover:text-[#0a2540]"
                        aria-label="Remove PDF"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#d8dee8] bg-[#fafbfc] px-4 py-12 text-center transition-colors hover:border-[#635bff]/40 hover:bg-[#f8f7ff]"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ebe9ff] text-[#635bff]">
                        <Upload className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-[#0a2540]">
                          Drop a PDF or click to browse
                        </p>
                        <p className="mt-0.5 text-[12px] text-[#697386]">
                          Up to 12 MB · chapter headings become tracks
                        </p>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <Label className="text-[13px] text-[#0a2540]">Format</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      id: "AUDIOBOOK" as const,
                      label: "Audiobook",
                      hint: "Chapter narration",
                      icon: Headphones,
                    },
                    {
                      id: "PODCAST" as const,
                      label: "Podcast",
                      hint: "Spoken episode script",
                      icon: Mic2,
                    },
                  ] as const
                ).map((option) => {
                  const Icon = option.icon;
                  const active = audioType === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onTypeChange(option.id)}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors",
                        active
                          ? "border-[#635bff] bg-[#f8f7ff]"
                          : "border-[#e6ebf1] hover:border-[#c9c5ff]"
                      )}
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          active ? "text-[#635bff]" : "text-[#697386]"
                        )}
                      />
                      <span>
                        <span className="block text-[13px] font-medium text-[#0a2540]">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-[#697386]">
                          {option.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-[13px] text-[#0a2540]">Voice</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {ELEVENLABS_VOICES.slice(0, 8).map((voice) => {
                  const active = voiceId === voice.id;
                  return (
                    <button
                      key={voice.id}
                      type="button"
                      onClick={() => setVoiceId(voice.id)}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-left transition-colors",
                        active
                          ? "border-[#635bff] bg-[#f8f7ff]"
                          : "border-[#e6ebf1] hover:border-[#c9c5ff]"
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium text-[#0a2540]">
                          {voice.name}
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.06em] text-[#a3acb9]">
                          {voice.gender}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[#697386]">
                        {voice.style} · {voice.description}
                      </span>
                    </button>
                  );
                })}
              </div>
              {ELEVENLABS_VOICES.length > 8 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ELEVENLABS_VOICES.slice(8).map((voice) => (
                    <button
                      key={voice.id}
                      type="button"
                      onClick={() => setVoiceId(voice.id)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        voiceId === voice.id
                          ? "border-[#635bff] bg-[#f8f7ff] text-[#635bff]"
                          : "border-[#e6ebf1] text-[#425466] hover:border-[#c9c5ff]"
                      )}
                    >
                      {voice.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label className="text-[13px] text-[#0a2540]">Delivery</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {VOICE_SETTING_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors",
                      activePreset === preset.id
                        ? "border-[#635bff] bg-[#f8f7ff] text-[#635bff]"
                        : "border-[#e6ebf1] text-[#425466] hover:border-[#c9c5ff]"
                    )}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6ebf1] bg-[#fafbfc] px-5 py-4 sm:px-6">
            <p className="text-[12px] text-[#697386]">
              {user && !audioLocked
                ? `${audioRemaining} min remaining this month`
                : "Uses your monthly audio minutes"}
            </p>
            <Button
              onClick={handleGenerate}
              disabled={busy || audioLocked}
              className="h-9 bg-[#635bff] text-[13px] hover:bg-[#5851e5]"
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : audioType === "PODCAST" ? (
                <Mic2 className="mr-2 h-4 w-4" />
              ) : (
                <Headphones className="mr-2 h-4 w-4" />
              )}
              Generate {audioType === "PODCAST" ? "podcast" : "audiobook"}
            </Button>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-[#e6ebf1] bg-white">
            <div className="flex items-center justify-between border-b border-[#e6ebf1] px-4 py-3">
              <div>
                <p className="text-[13px] font-medium text-[#0a2540]">Library</p>
                <p className="text-[11px] text-[#697386]">
                  Private · not on Home
                </p>
              </div>
              {activeBookId && (
                <button
                  type="button"
                  onClick={startNew}
                  className="text-[12px] font-medium text-[#635bff] hover:underline"
                >
                  New
                </button>
              )}
            </div>

            <div className="max-h-[420px] overflow-y-auto p-2">
              {loadingProjects ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-4 w-4 animate-spin text-[#635bff]" />
                </div>
              ) : projects.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <Headphones className="mx-auto h-5 w-5 text-[#c9c5ff]" />
                  <p className="mt-2 text-[12px] text-[#a3acb9]">
                    Your studio projects will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {projects.map((project) => {
                    const latest = project.audios[0];
                    const active = activeBookId === project.id;
                    const status = latest?.status ?? "DRAFT";
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => void openProject(project)}
                        className={cn(
                          "flex w-full flex-col rounded-lg px-3 py-2.5 text-left transition-colors",
                          active
                            ? "bg-[#f8f7ff] ring-1 ring-[#c9c5ff]"
                            : "hover:bg-[#f6f9fc]"
                        )}
                      >
                        <span className="truncate text-[13px] font-medium text-[#0a2540]">
                          {project.title}
                        </span>
                        <span className="mt-1.5 flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-medium",
                              statusTone(status)
                            )}
                          >
                            {statusLabel(status)}
                          </span>
                          <span className="text-[11px] capitalize text-[#697386]">
                            {latest ? latest.type.toLowerCase() : "No audio"}
                            {latest?.voiceName ? ` · ${latest.voiceName}` : ""}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[#e6ebf1] px-4 py-3.5 text-[12px] leading-relaxed text-[#697386]">
            <p className="font-medium text-[#0a2540]">Quick tips</p>
            <ul className="mt-2 space-y-1.5">
              <li>Use text-based PDFs — scans extract poorly.</li>
              <li>Chapter headings become separate tracks.</li>
              <li>Podcast mode rewrites copy for spoken delivery.</li>
            </ul>
            <Link
              href="/dashboard/billing"
              className="mt-3 inline-block font-medium text-[#635bff] hover:underline"
            >
              Manage audio capacity
            </Link>
          </div>
        </aside>
      </div>

      {showPlayer && (
        <div ref={playerRef} className="scroll-mt-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#0a2540]">
                Player
              </h2>
              <p className="text-[12px] text-[#697386]">
                Tracks appear as each chapter finishes — play while generating.
              </p>
            </div>
          </div>
          <BookAudioPanel
            audios={audios}
            generatingType={generatingType}
            phaseMessage={phaseMessage}
          />
        </div>
      )}
    </div>
  );
}
