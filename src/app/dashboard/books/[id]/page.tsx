"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CopyPlus,
  Download,
  ExternalLink,
  Globe,
  Headphones,
  ImageIcon,
  Loader2,
  Lock,
  PenLine,
  Play,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BookCover } from "@/components/dashboard/book-cover";
import { LiveGenerationDock } from "@/components/dashboard/live-generation-dock";
import {
  BookDerivativesDialog,
  type AudioDerivativeType,
} from "@/components/dashboard/book-derivatives-dialog";
import {
  BookAudioPanel,
  type BookAudioItem,
} from "@/components/dashboard/book-audio-panel";
import { useDashboardUser } from "@/components/dashboard/user-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AnonymousRouteFallback } from "@/components/dashboard/anonymous-route-fallback";

interface Section {
  id: string;
  number: number;
  title: string;
  pageCount: number;
  content: string | null;
}

interface Chapter {
  id: string;
  number: number;
  title: string;
  summary: string | null;
  pageCount: number;
  status: string;
  sections: Section[];
}

interface Book {
  id: string;
  slug: string;
  isPublic: boolean;
  canMakePrivate: boolean;
  title: string;
  description: string | null;
  genre: string | null;
  targetPages: number;
  currentPages: number;
  status: string;
  progress: number;
  tone: string | null;
  audience: string | null;
  pov: string;
  tense: string;
  language: string;
  model: string;
  creativity: number;
  includeDialogue: boolean;
  includeExamples: boolean;
  customInstructions: string | null;
  characters: string[] | null;
  themes: string[] | null;
  errorMessage: string | null;
  coverImage: string | null;
  edition: number;
  generateAudiobookOnComplete?: boolean;
  chapters: Chapter[];
  audios?: BookAudioItem[];
}

interface BookEdition {
  id: string;
  title: string;
  edition: number;
  status: string;
  coverImage: string | null;
  slug: string;
  createdAt: string;
}

const statusStyles: Record<string, string> = {
  DRAFT: "text-[#697386]",
  OUTLINING: "text-[#635bff]",
  GENERATING: "text-[#9a6700] bg-[#fcf5e0] px-2 py-0.5 rounded",
  COMPLETED: "text-[#0e6245] bg-[#cbf4c9] px-2 py-0.5 rounded",
  FAILED: "text-[#df1b41] bg-[#fde8e8] px-2 py-0.5 rounded",
};

type LiveSection = {
  sectionId: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  sectionNumber: number;
  sectionTitle: string;
};

function parseSseChunk(buffer: string): {
  events: { type: string; data: Record<string, unknown> }[];
  rest: string;
} {
  const events: { type: string; data: Record<string, unknown> }[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";

  for (const part of parts) {
    if (!part.trim()) continue;
    let type = "message";
    let data = "";
    for (const line of part.split("\n")) {
      if (line.startsWith("event: ")) type = line.slice(7).trim();
      if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (!data) continue;
    try {
      events.push({ type, data: JSON.parse(data) });
    } catch {
      /* skip malformed */
    }
  }
  return { events, rest };
}

function BookDetailPageContent() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const autoStarted = useRef(false);
  const watchingRef = useRef(false);
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [liveContent, setLiveContent] = useState("");
  const [liveSection, setLiveSection] = useState<LiveSection | null>(null);
  const [phaseMessage, setPhaseMessage] = useState<string | null>(null);
  const [dockOpen, setDockOpen] = useState(false);
  const [dockMinimized, setDockMinimized] = useState(false);
  const [derivativesOpen, setDerivativesOpen] = useState(false);
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [creatingEdition, setCreatingEdition] = useState(false);
  const [editions, setEditions] = useState<BookEdition[]>([]);
  const [audios, setAudios] = useState<BookAudioItem[]>([]);
  const [audioGeneratingType, setAudioGeneratingType] =
    useState<AudioDerivativeType | null>(null);
  const [audioPhaseMessage, setAudioPhaseMessage] = useState<string | null>(
    null
  );
  const audioWatchingRef = useRef(false);
  const liveRef = useRef<HTMLDivElement>(null);
  const { refresh: refreshUser } = useDashboardUser();

  const fetchBook = useCallback(async () => {
    const res = await fetch(`/api/books/${id}`);
    if (res.ok) {
      const data = await res.json();
      setBook(data);
      setEditions(data.editions ?? []);
      setAudios(data.audios ?? []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchBook();
  }, [fetchBook]);

  useEffect(() => {
    if (
      autoStarted.current ||
      loading ||
      watchingRef.current ||
      !book ||
      searchParams.get("generate") !== "1"
    ) {
      return;
    }
    if (book.status === "DRAFT" || book.status === "FAILED") {
      autoStarted.current = true;
      void startGeneration();
    }
  }, [loading, book, searchParams]);

  useEffect(() => {
    if (loading || watchingRef.current || !book) return;
    const inProgress =
      book.status === "GENERATING" || book.status === "OUTLINING";
    if (inProgress && searchParams.get("generate") !== "1") {
      void subscribeToGeneration();
    }
  }, [loading, book?.status, searchParams]);

  useEffect(() => {
    if (!generating || dockMinimized || !liveRef.current) return;
    liveRef.current.scrollTop = liveRef.current.scrollHeight;
  }, [liveContent, generating, dockMinimized]);

  async function handleStreamEvent(evt: {
    type: string;
    data: Record<string, unknown>;
  }) {
    const d = evt.data;

    if (evt.type === "phase") {
      setPhaseMessage(
        (d.message as string) ?? (d.phase as string) ?? "Working…"
      );
    }

    if (evt.type === "outline_ready") {
      await fetchBook();
    }

    if (evt.type === "section_start") {
      const info: LiveSection = {
        sectionId: d.sectionId as string,
        chapterId: d.chapterId as string,
        chapterNumber: d.chapterNumber as number,
        chapterTitle: d.chapterTitle as string,
        sectionNumber: d.sectionNumber as number,
        sectionTitle: d.sectionTitle as string,
      };
      setLiveSection(info);
      setLiveContent("");
      setExpanded(info.chapterId);
      setPhaseMessage(
        `Writing Chapter ${info.chapterNumber}: ${info.sectionTitle}`
      );
    }

    if (evt.type === "token") {
      const text = d.text as string;
      const sectionId = d.sectionId as string;
      setLiveContent((prev) => prev + text);
      setBook((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: "GENERATING",
          chapters: prev.chapters.map((ch) => ({
            ...ch,
            status: "GENERATING",
            sections: ch.sections.map((s) =>
              s.id === sectionId
                ? { ...s, content: (s.content ?? "") + text }
                : s
            ),
          })),
        };
      });
    }

    if (evt.type === "progress") {
      refreshUser();
      setBook((prev) =>
        prev
          ? {
              ...prev,
              progress: d.progress as number,
              currentPages: d.currentPages as number,
              status: d.status as string,
            }
          : prev
      );
    }

    if (evt.type === "section_done") {
      refreshUser();
      setLiveContent("");
      await fetchBook();
    }

    if (evt.type === "cover_ready") {
      setCoverGenerating(false);
      setBook((prev) =>
        prev
          ? { ...prev, coverImage: d.coverImage as string }
          : prev
      );
    }

    if (evt.type === "done") {
      toast.success("Book generation complete");
      const latest = await fetch(`/api/books/${id}`).then((r) =>
        r.ok ? r.json() : null
      );
      if (latest) {
        setBook(latest);
        setAudios(latest.audios ?? []);
      }
      if (latest?.generateAudiobookOnComplete) {
        toast.message("Starting audiobook narration…");
        void startAudioGeneration("AUDIOBOOK").catch((error) => {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to start audiobook";
          toast.error(message);
        });
      } else {
        setDerivativesOpen(true);
      }
    }

    if (evt.type === "error") {
      throw new Error((d.message as string) ?? "Generation failed");
    }
  }

  async function getBookStatus() {
    const res = await fetch(`/api/books/${id}`);
    if (!res.ok) return null;
    const data = (await res.json()) as Book;
    setBook(data);
    return data.status;
  }

  async function subscribeToGeneration(options?: { resetLive?: boolean }) {
    if (watchingRef.current) return;
    watchingRef.current = true;

    setGenerating(true);
    setDockOpen(true);
    setDockMinimized(false);
    if (options?.resetLive) {
      setLiveContent("");
      setLiveSection(null);
    }
    setPhaseMessage((prev) => prev ?? "Connecting to live generation…");

    try {
      const res = await fetch(`/api/generate/${id}/stream`, { method: "POST" });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "Generation failed"
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
          await handleStreamEvent(evt);
        }
      }

      await getBookStatus();
    } catch (error) {
      const status = await getBookStatus();
      if (status !== "GENERATING" && status !== "OUTLINING") {
        const message =
          error instanceof Error ? error.message : "Generation failed";
        toast.error(message);
        await fetchBook();
      }
    } finally {
      const status = await getBookStatus();
      if (status === "GENERATING" || status === "OUTLINING") {
        watchingRef.current = false;
        setTimeout(() => {
          void subscribeToGeneration();
        }, 1200);
        return;
      }

      watchingRef.current = false;
      setGenerating(false);
      setLiveSection(null);
      setLiveContent("");
      setPhaseMessage(null);
      setDockOpen(false);
      setDockMinimized(false);
      if (status === "COMPLETED") {
        const latest = await fetch(`/api/books/${id}`).then((r) =>
          r.ok ? r.json() : null
        );
        if (latest?.generateAudiobookOnComplete) {
          // Audiobook kickoff handled on "done" event / server side
          setAudios(latest.audios ?? []);
        } else {
          setDerivativesOpen(true);
        }
      }
    }
  }

  async function startGeneration() {
    setPhaseMessage("Starting…");
    setBook((prev) =>
      prev ? { ...prev, status: "GENERATING", errorMessage: null } : prev
    );
    await subscribeToGeneration({ resetLive: true });
  }

  async function handleAudioStreamEvent(
    evt: {
      type: string;
      data: Record<string, unknown>;
    },
    audioId: string
  ) {
    const d = evt.data;

    if (evt.type === "phase") {
      setAudioPhaseMessage((d.message as string) ?? null);
      if (d.audioType) {
        setAudioGeneratingType(d.audioType as AudioDerivativeType);
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
      await fetchBook();
    }

    if (evt.type === "done") {
      toast.success("Audio generation complete");
      setAudioGeneratingType(null);
      setAudioPhaseMessage(null);
      await fetchBook();
    }

    if (evt.type === "error") {
      throw new Error((d.message as string) ?? "Audio generation failed");
    }
  }

  async function subscribeToAudio(audioId: string) {
    if (audioWatchingRef.current) return;
    audioWatchingRef.current = true;

    try {
      const res = await fetch(`/api/audio/${audioId}/stream`, {
        method: "POST",
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "Audio generation failed"
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
          await handleAudioStreamEvent(evt, audioId);
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Audio generation failed";
      toast.error(message);
      await fetchBook();
    } finally {
      audioWatchingRef.current = false;
      setAudioGeneratingType(null);
      setAudioPhaseMessage(null);
      await fetchBook();
    }
  }

  async function startAudioGeneration(
    type: AudioDerivativeType,
    regenerate = false,
    options?: {
      voiceId?: string;
      voiceName?: string;
      voiceSettings?: {
        stability: number;
        similarityBoost: number;
        style: number;
        speed: number;
        useSpeakerBoost: boolean;
        modelId: string;
      };
    }
  ) {
    setAudioGeneratingType(type);
    setAudioPhaseMessage(
      regenerate ? "Restarting audio generation…" : "Starting audio generation…"
    );

    const res = await fetch("/api/audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId: id,
        type,
        regenerate,
        voiceId: options?.voiceId,
        voiceName: options?.voiceName,
        voiceSettings: options?.voiceSettings,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAudioGeneratingType(null);
      setAudioPhaseMessage(null);
      throw new Error(
        (data as { error?: string }).error ?? "Failed to start audio generation"
      );
    }

    const audio = (data as { audio: BookAudioItem }).audio;
    setAudios((prev) => {
      const next = { ...audio, tracks: audio.tracks ?? [] };
      const idx = prev.findIndex((a) => a.id === audio.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = next;
        return copy;
      }
      return [next, ...prev];
    });

    if ((data as { completed?: boolean }).completed) {
      toast.success("Audio already ready");
      setAudioGeneratingType(null);
      setAudioPhaseMessage(null);
      await fetchBook();
      return;
    }

    toast.success(
      type === "AUDIOBOOK"
        ? "Narrating audiobook…"
        : type === "PODCAST"
          ? "Recording podcast…"
          : "Composing theme music…"
    );
    await subscribeToAudio(audio.id);
  }

  useEffect(() => {
    if (loading || audioWatchingRef.current || !book) return;
    const source = audios.length > 0 ? audios : (book.audios ?? []);
    const inProgress = source.find(
      (a) => a.status === "GENERATING" || a.status === "PENDING"
    );
    if (!inProgress) return;
    setAudioGeneratingType(inProgress.type);
    void subscribeToAudio(inProgress.id);
    // Resume in-flight audio jobs once after book load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, book?.id]);

  async function regenerate(chapterId: string) {
    setRegenerating(chapterId);
    const res = await fetch(
      `/api/books/${id}/chapters/${chapterId}/regenerate`,
      { method: "POST" }
    );
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Regeneration failed");
    } else {
      toast.success("Chapter regenerated");
      await fetchBook();
    }
    setRegenerating(null);
  }

  async function toggleVisibility() {
    if (!book) return;
    const nextPublic = !book.isPublic;
    if (!nextPublic && !book.canMakePrivate) {
      toast.error("Private books require Pro or Enterprise");
      return;
    }
    setTogglingVisibility(true);
    const res = await fetch(`/api/books/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic: nextPublic }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Could not update visibility");
    } else {
      setBook((prev) =>
        prev
          ? {
              ...prev,
              isPublic: data.isPublic,
              canMakePrivate: data.canMakePrivate ?? prev.canMakePrivate,
            }
          : prev
      );
      toast.success(nextPublic ? "Book is now public" : "Book is now private");
    }
    setTogglingVisibility(false);
  }

  async function createEdition(startGeneration: boolean) {
    setCreatingEdition(true);
    const res = await fetch(`/api/books/${id}/edition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startGeneration }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Could not create edition");
      setCreatingEdition(false);
      return;
    }
    toast.success(`Edition ${data.edition} created`);
    const href = startGeneration
      ? `/dashboard/books/${data.id}?generate=1`
      : `/dashboard/books/${data.id}`;
    router.push(href);
  }

  async function regenerateCover() {
    setCoverGenerating(true);
    const res = await fetch(`/api/books/${id}/cover`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Cover generation failed");
      setCoverGenerating(false);
      return;
    }
    setBook((prev) =>
      prev ? { ...prev, coverImage: data.coverImage as string } : prev
    );
    setCoverGenerating(false);
    toast.success("Book cover generated");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[#635bff]" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="py-16 text-center">
        <p className="text-[#697386]">Book not found</p>
        <Button className="mt-4" asChild>
          <Link href="/dashboard">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <BookDerivativesDialog
        open={derivativesOpen}
        onOpenChange={setDerivativesOpen}
        bookTitle={book.title}
        onStartAudio={startAudioGeneration}
        existingTypes={audios
          .filter((a) => a.status === "COMPLETED")
          .map((a) => a.type)}
      />

      <LiveGenerationDock
        open={dockOpen}
        minimized={dockMinimized}
        onMinimize={() => setDockMinimized(true)}
        onExpand={() => setDockMinimized(false)}
        phaseMessage={phaseMessage}
        liveSection={liveSection}
        liveContent={liveContent}
        progress={book.progress}
        currentPages={book.currentPages}
        targetPages={book.targetPages}
        bookTitle={book.title}
        contentRef={liveRef}
      />

      <div
        className={cn(
          "space-y-8"
        )}
      >
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-4 text-[#697386]" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 flex-1 gap-4">
            <div className="shrink-0 space-y-2">
              <BookCover
                title={book.title}
                coverImage={book.coverImage}
                generating={
                  coverGenerating ||
                  (!book.coverImage &&
                    (book.status === "GENERATING" ||
                      book.status === "OUTLINING" ||
                      generating))
                }
                aspect="compact"
                className="shadow-sm ring-1 ring-black/5"
              />
              {(book.chapters.length > 0 || book.coverImage) && (
                <button
                  type="button"
                  onClick={regenerateCover}
                  disabled={coverGenerating}
                  className="flex w-full items-center justify-center gap-1 rounded-md border border-[#e6ebf1] bg-white px-2 py-1.5 text-[11px] font-medium text-[#697386] transition-colors hover:border-[#635bff]/30 hover:text-[#635bff] disabled:opacity-50"
                >
                  {coverGenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ImageIcon className="h-3 w-3" />
                  )}
                  {book.coverImage ? "New cover" : "Cover"}
                </button>
              )}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-[#0a2540]">
              {book.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
              {(book.edition ?? 1) > 1 && (
                <span className="rounded bg-[#f0efff] px-2 py-0.5 text-[11px] font-medium text-[#635bff]">
                  Edition {book.edition}
                </span>
              )}
              <span
                className={cn(
                  "font-medium capitalize",
                  statusStyles[book.status] ?? "text-[#697386]"
                )}
              >
                {book.status.toLowerCase()}
              </span>
              {book.genre && (
                <span className="text-[#697386]">· {book.genre}</span>
              )}
              {book.tone && (
                <span className="text-[#697386]">· {book.tone}</span>
              )}
            </div>
            {book.description && (
              <p className="mt-3 max-w-2xl text-[14px] text-[#425466]">
                {book.description}
              </p>
            )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {book.chapters.length > 0 && (
              <Button
                variant="outline"
                className="h-9 border-[#e6ebf1] text-[13px]"
                asChild
              >
                <a
                  href={`/editor/${book.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <PenLine className="mr-1.5 h-3.5 w-3.5" />
                  Open editor
                </a>
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => createEdition(true)}
              disabled={creatingEdition}
              className="h-9 border-[#e6ebf1] text-[13px]"
            >
              {creatingEdition ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CopyPlus className="mr-1.5 h-3.5 w-3.5" />
              )}
              New edition
            </Button>
            {(book.status === "DRAFT" || book.status === "FAILED") && !generating && (
              <Button
                onClick={startGeneration}
                disabled={generating}
                className="h-9 rounded-md bg-[#635bff] text-[13px] hover:bg-[#5851e5]"
              >
                {generating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                )}
                {book.status === "FAILED" ? "Retry" : "Generate"}
              </Button>
            )}
            {book.status === "GENERATING" && (
              <Button
                variant="outline"
                onClick={fetchBook}
                className="h-9 border-[#e6ebf1] text-[13px]"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Refresh
              </Button>
            )}
            {book.status === "COMPLETED" && (
              <Button
                variant="outline"
                onClick={() => setDerivativesOpen(true)}
                className="h-9 border-[#e6ebf1] text-[13px]"
              >
                <Headphones className="mr-1.5 h-3.5 w-3.5" />
                Audio studio
              </Button>
            )}
            <Button
              variant="outline"
              className="h-9 border-[#e6ebf1] text-[13px]"
              asChild
            >
              <a href={`/api/books/${book.id}/export`}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export Markdown
              </a>
            </Button>
          </div>
        </div>
      </div>

      {editions.length > 1 && (
        <div className="rounded-lg border border-[#e6ebf1] bg-white p-5">
          <h2 className="text-[15px] font-medium text-[#0a2540]">
            Editions ({editions.length})
          </h2>
          <p className="mt-1 text-[13px] text-[#697386]">
            Each edition reuses the same premise and settings with a fresh
            manuscript.
          </p>
          <ul className="mt-4 divide-y divide-[#e6ebf1] rounded-lg border border-[#e6ebf1]">
            {editions.map((edition) => (
              <li key={edition.id}>
                <Link
                  href={`/dashboard/books/${edition.id}`}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#f6f9fc]",
                    edition.id === book.id && "bg-[#f6f9fc]"
                  )}
                >
                  <BookCover
                    title={edition.title}
                    coverImage={edition.coverImage}
                    aspect="compact"
                    className="w-[44px] shadow-sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[#0a2540]">
                      {edition.title}
                    </p>
                    <p className="text-[12px] capitalize text-[#697386]">
                      Edition {edition.edition} · {edition.status.toLowerCase()}
                    </p>
                  </div>
                  {edition.id === book.id && (
                    <span className="shrink-0 text-[11px] font-medium text-[#635bff]">
                      Viewing
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {book.status === "COMPLETED" && (
        <BookAudioPanel
          audios={audios}
          generatingType={audioGeneratingType}
          phaseMessage={audioPhaseMessage}
          onOpenStudio={() => setDerivativesOpen(true)}
        />
      )}

      {book.status !== "COMPLETED" && (
        <div className="rounded-lg border border-[#e6ebf1] bg-white p-5">
          <div className="mb-2 flex items-center justify-between text-[13px] text-[#697386]">
            <span>Progress</span>
            <span>
              {Math.round(book.progress)}% complete · {book.currentPages} pages
              written
              {book.targetPages > 0 ? ` (target ${book.targetPages})` : ""}
            </span>
          </div>
          <Progress value={book.progress} className="h-1.5" />
          {book.errorMessage && (
            <p className="mt-3 text-[13px] text-[#df1b41]">{book.errorMessage}</p>
          )}
        </div>
      )}

      {book.status === "COMPLETED" && book.errorMessage && (
        <div className="rounded-lg border border-[#e6ebf1] bg-white p-5">
          <p className="text-[13px] text-[#df1b41]">{book.errorMessage}</p>
        </div>
      )}

      <div className="rounded-lg border border-[#e6ebf1] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {book.isPublic ? (
                <Globe className="h-4 w-4 text-[#0e6245]" />
              ) : (
                <Lock className="h-4 w-4 text-[#697386]" />
              )}
              <h2 className="text-[15px] font-medium text-[#0a2540]">
                {book.isPublic ? "Public book" : "Private book"}
              </h2>
            </div>
            <p className="mt-1 text-[13px] text-[#697386]">
              {book.isPublic
                ? "Indexed for SEO and listed on /books"
                : "Hidden from public search and the books directory"}
            </p>
            <p className="mt-3 font-mono text-[12px] text-[#a3acb9]">
              Unique ID · {book.slug}
            </p>
            {book.isPublic && book.slug && (
              <a
                href={`/books/${book.slug}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-[#635bff] hover:underline"
              >
                View public page
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button
              variant="outline"
              disabled={
                togglingVisibility || (book.isPublic && !book.canMakePrivate)
              }
              onClick={toggleVisibility}
              className="h-9 border-[#e6ebf1] text-[13px]"
            >
              {togglingVisibility ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : book.isPublic ? (
                <Lock className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Globe className="mr-1.5 h-3.5 w-3.5" />
              )}
              {book.isPublic ? "Make private" : "Make public"}
            </Button>
            {book.isPublic && !book.canMakePrivate && (
              <Link
                href="/dashboard/billing"
                className="text-[12px] text-[#697386] hover:text-[#635bff]"
              >
                Upgrade to make private →
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-px overflow-hidden rounded-lg border border-[#e6ebf1] bg-[#e6ebf1] sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "POV", value: book.pov },
          { label: "Tense", value: book.tense },
          { label: "Model", value: book.model },
          { label: "Creativity", value: String(book.creativity) },
          { label: "Language", value: book.language },
          { label: "Audience", value: book.audience ?? "—" },
          {
            label: "Dialogue",
            value: book.includeDialogue ? "On" : "Off",
          },
          {
            label: "Examples",
            value: book.includeExamples ? "On" : "Off",
          },
        ].map((item) => (
          <div key={item.label} className="bg-white px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#697386]">
              {item.label}
            </p>
            <p className="mt-1 truncate text-[13px] capitalize text-[#0a2540]">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {(book.characters?.length || book.themes?.length || book.customInstructions) && (
        <div className="space-y-3 rounded-lg border border-[#e6ebf1] bg-white p-5">
          <h2 className="text-[15px] font-medium text-[#0a2540]">
            Customization
          </h2>
          {book.characters && book.characters.length > 0 && (
            <div>
              <p className="text-[12px] font-medium uppercase tracking-wider text-[#697386]">
                Characters
              </p>
              <ul className="mt-1 space-y-1 text-[13px] text-[#425466]">
                {book.characters.map((c) => (
                  <li key={c}>· {c}</li>
                ))}
              </ul>
            </div>
          )}
          {book.themes && book.themes.length > 0 && (
            <div>
              <p className="text-[12px] font-medium uppercase tracking-wider text-[#697386]">
                Themes
              </p>
              <p className="mt-1 text-[13px] text-[#425466]">
                {book.themes.join(", ")}
              </p>
            </div>
          )}
          {book.customInstructions && (
            <div>
              <p className="text-[12px] font-medium uppercase tracking-wider text-[#697386]">
                Instructions
              </p>
              <p className="mt-1 text-[13px] text-[#425466]">
                {book.customInstructions}
              </p>
            </div>
          )}
        </div>
      )}

      <div>
        <h2 className="text-[15px] font-medium text-[#0a2540]">
          Chapters ({book.chapters.length})
        </h2>

        {book.chapters.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-[#e6ebf1] px-6 py-12 text-center text-[14px] text-[#697386]">
            No chapters yet. Start generation to create the outline.
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-[#e6ebf1]">
            {book.chapters.map((chapter) => (
              <div
                key={chapter.id}
                className="border-b border-[#e6ebf1] last:border-0"
              >
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() =>
                      setExpanded(
                        expanded === chapter.id ? null : chapter.id
                      )
                    }
                  >
                    <p className="text-[14px] font-medium text-[#0a2540]">
                      Chapter {chapter.number}: {chapter.title}
                    </p>
                    {chapter.summary && (
                      <p className="mt-0.5 line-clamp-2 text-[13px] text-[#697386]">
                        {chapter.summary}
                      </p>
                    )}
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn(
                        "text-[12px] font-medium capitalize",
                        statusStyles[chapter.status] ?? "text-[#697386]"
                      )}
                    >
                      {chapter.status.toLowerCase()}
                    </span>
                    {chapter.pageCount > 0 && (
                      <span className="text-[12px] text-[#697386]">
                        {chapter.pageCount}p
                      </span>
                    )}
                    {(book.status === "COMPLETED" ||
                      book.status === "DRAFT" ||
                      book.status === "FAILED") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[#697386]"
                        disabled={regenerating === chapter.id}
                        onClick={() => regenerate(chapter.id)}
                      >
                        {regenerating === chapter.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {expanded === chapter.id && (
                  <div className="space-y-4 border-t border-[#e6ebf1] bg-[#f6f9fc] px-4 py-4">
                    {chapter.sections.map((section) => (
                      <div key={section.id}>
                        <p className="text-[12px] font-medium text-[#697386]">
                          {section.title}
                          {section.pageCount > 0 && ` · ${section.pageCount} pages`}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[#425466]">
                          {section.content ??
                            (generating &&
                            liveSection?.sectionId === section.id
                              ? liveContent
                              : null) ??
                            "Not generated yet."}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  );
}

export default function BookDetailPage() {
  return (
    <AnonymousRouteFallback
      title="Book details"
      description="View book progress, chapters, and generation options."
    >
      <BookDetailPageContent />
    </AnonymousRouteFallback>
  );
}
