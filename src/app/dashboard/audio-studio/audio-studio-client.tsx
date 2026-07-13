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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export function AudioStudioClient() {
  const { user, refresh: refreshUser } = useDashboardUser();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
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
    if (!pdfFile && wordCount < 40) {
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
      if (text.trim()) form.set("text", text.trim());
      if (pdfFile) form.set("file", pdfFile);

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
    const inProgress = (project.audios ?? []).find(
      (a) => a.status === "GENERATING" || a.status === "PENDING"
    );
    if (inProgress && (inProgress.type === "AUDIOBOOK" || inProgress.type === "PODCAST")) {
      setGeneratingType(inProgress.type);
      void subscribeToAudio(inProgress.id, project.id);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0a2540]">
          Audio Studio
        </h1>
        <p className="mt-1 max-w-xl text-[14px] text-[#697386]">
          Paste text or upload a PDF, then generate an audiobook or podcast with
          ElevenLabs voices.
        </p>
      </div>

      {audioLocked && (
        <div className="rounded-lg border border-[#e6ebf1] bg-[#f6f9fc] px-4 py-3 text-[13px] text-[#425466]">
          Audio narration is available on Pro, Premium, or during a Premium
          trial.{" "}
          <UpgradeLink plan="PRO" className="font-medium text-[#635bff] hover:underline">
            Upgrade
          </UpgradeLink>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5 rounded-xl border border-[#e6ebf1] bg-white p-5 sm:p-6">
          <div>
            <Label className="text-[13px] text-[#0a2540]">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My audiobook or podcast episode"
              className="mt-2 h-10 border-[#e6ebf1]"
              maxLength={200}
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[13px] text-[#0a2540]">Script or manuscript</Label>
              <span className="text-[11px] tabular-nums text-[#a3acb9]">
                {pdfFile
                  ? "PDF selected"
                  : `${wordCount.toLocaleString()} words${
                      estimatedMinutes
                        ? ` · ~${estimatedMinutes} min`
                        : ""
                    }`}
              </span>
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste chapters, an article, show notes, or any long-form text…"
              className="mt-2 min-h-[220px] resize-y border-[#e6ebf1] text-[14px] leading-relaxed"
              disabled={Boolean(pdfFile)}
            />
            {pdfFile && (
              <p className="mt-2 text-[12px] text-[#697386]">
                Text area is locked while a PDF is attached. Remove the PDF to
                paste text instead.
              </p>
            )}
          </div>

          <div>
            <Label className="text-[13px] text-[#0a2540]">Or upload a PDF</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => onPdfPicked(e.target.files?.[0] ?? null)}
            />
            {pdfFile ? (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-[#e6ebf1] bg-[#f6f9fc] px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-[#635bff]" />
                  <span className="truncate text-[13px] text-[#0a2540]">
                    {pdfFile.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-[#a3acb9]">
                    {(pdfFile.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPdfFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="rounded-md p-1 text-[#697386] hover:bg-white hover:text-[#0a2540]"
                  aria-label="Remove PDF"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#d8dee8] bg-[#fafbfc] px-4 py-6 text-[13px] text-[#425466] transition-colors hover:border-[#635bff]/50 hover:bg-[#f0efff]/40"
              >
                <Upload className="h-4 w-4 text-[#635bff]" />
                Choose PDF (text-based, up to 12 MB)
              </button>
            )}
          </div>

          <div>
            <Label className="text-[13px] text-[#0a2540]">Output</Label>
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
                    hint: "Episode-style script",
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
                      "flex items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
                      active
                        ? "border-[#635bff] bg-[#f0efff]"
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
            <Select value={voiceId} onValueChange={(v) => v && setVoiceId(v)}>
              <SelectTrigger className="mt-2 h-10 w-full border-[#e6ebf1]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ELEVENLABS_VOICES.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name} · {voice.style} · {voice.gender}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-[12px] text-[#697386]">
              {selectedVoice.description}
            </p>
          </div>

          <div>
            <Label className="text-[13px] text-[#0a2540]">Voice preset</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {VOICE_SETTING_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors",
                    activePreset === preset.id
                      ? "border-[#635bff] bg-[#f0efff] text-[#635bff]"
                      : "border-[#e6ebf1] text-[#425466] hover:border-[#c9c5ff]"
                  )}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6ebf1] pt-4">
            <p className="text-[12px] text-[#697386]">
              {user && !audioLocked
                ? `${audioRemaining} min audio left this month`
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
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-[#e6ebf1] bg-white p-4">
            <p className="text-[13px] font-medium text-[#0a2540]">
              Recent projects
            </p>
            <p className="mt-1 text-[12px] text-[#697386]">
              Studio imports stay private and separate from your book library.
            </p>
            <div className="mt-3 space-y-1.5">
              {loadingProjects ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-[#635bff]" />
                </div>
              ) : projects.length === 0 ? (
                <p className="py-4 text-[12px] text-[#a3acb9]">
                  No projects yet.
                </p>
              ) : (
                projects.map((project) => {
                  const latest = project.audios[0];
                  const active = activeBookId === project.id;
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => void openProject(project)}
                      className={cn(
                        "flex w-full flex-col rounded-md px-2.5 py-2 text-left transition-colors",
                        active
                          ? "bg-[#f0efff]"
                          : "hover:bg-[#f6f9fc]"
                      )}
                    >
                      <span className="truncate text-[13px] font-medium text-[#0a2540]">
                        {project.title}
                      </span>
                      <span className="mt-0.5 text-[11px] capitalize text-[#697386]">
                        {latest
                          ? `${latest.type.toLowerCase()} · ${latest.status.toLowerCase()}`
                          : "No audio yet"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[#e6ebf1] bg-[#f6f9fc] p-4 text-[12px] leading-relaxed text-[#697386]">
            <p className="font-medium text-[#0a2540]">Tips</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>Use text-based PDFs (scanned pages may extract poorly).</li>
              <li>Chapter headings become separate audio tracks.</li>
              <li>
                Podcast mode rewrites your source into spoken episode scripts.
              </li>
            </ul>
            <Link
              href="/dashboard/billing"
              className="mt-3 inline-block text-[#635bff] hover:underline"
            >
              Manage audio capacity
            </Link>
          </div>
        </div>
      </div>

      {(audios.length > 0 || generatingType) && (
        <BookAudioPanel
          audios={audios}
          generatingType={generatingType}
          phaseMessage={phaseMessage}
        />
      )}
    </div>
  );
}
