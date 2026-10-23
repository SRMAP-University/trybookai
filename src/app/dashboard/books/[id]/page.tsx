"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  CircleCheck,
  Clock,
  CopyPlus,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  Globe,
  Headphones,
  ImageIcon,
  Loader2,
  LoaderCircle,
  Lock,
  MessageSquareWarning,
  PenLine,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { StoryReelPanel } from "@/components/reels/story-reel-panel";
import { IllustrationsPanel } from "@/components/book/illustrations-panel";
import { BookReadyDialog } from "@/components/book/book-ready-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ExpandableDescription } from "@/components/ui/expandable-description";
import { AnonymousRouteFallback } from "@/components/dashboard/anonymous-route-fallback";
import {
  GenerationReviewDialog,
  wasReviewDismissed,
} from "@/components/dashboard/generation-review-dialog";
import { GenerationSpeedDialog } from "@/components/dashboard/generation-speed-dialog";
import { PremiumUpgradeDialog } from "@/components/dashboard/premium-upgrade-dialog";
import type { GenerationSpeed } from "@/lib/ai-models";
import { BookManuscript } from "@/components/book/book-manuscript";
import { serifDisplay } from "@/components/marketing/home/fonts";
import {
  AI_MODELS,
  BOOK_LANGUAGES,
  CREATIVITY_LEVELS,
} from "@/lib/constants";
import { countWords, formatWords, readingTime } from "@/lib/reading-stats";
import { genreColor } from "@/app/dashboard/books/new/book-preview";

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
  imageUrl?: string | null;
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
  templateId?: string | null;
  edition: number;
  generateAudiobookOnComplete?: boolean;
  includeIllustrations?: boolean;
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

const POV_LABELS: Record<string, string> = {
  first: "First person",
  second: "Second person",
  third: "Third person",
  omniscient: "Omniscient",
};

type ChapterState = "done" | "writing" | "pending";

/** Secondary buttons on the dark hero stage. */
const stageButton =
  "h-10 rounded-full border border-white/15 bg-white/10 px-3 text-[13.5px] text-white hover:bg-white/20 hover:text-white sm:px-4";

/**
 * Whether a chapter is written, being written, or still to come. Streaming
 * marks every chapter GENERATING, so fully written sections also count.
 */
function chapterState(
  chapter: Chapter,
  inProgress: boolean,
  liveChapterId: string | undefined
): ChapterState {
  const written = chapter.sections.filter((s) => s.content?.trim()).length;
  if (
    chapter.status === "COMPLETED" ||
    (chapter.sections.length > 0 && written === chapter.sections.length)
  ) {
    return "done";
  }
  if (inProgress && (liveChapterId ? liveChapterId === chapter.id : written > 0)) {
    return "writing";
  }
  return "pending";
}

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
  const [synopsisOpen, setSynopsisOpen] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [liveContent, setLiveContent] = useState("");
  const [liveSection, setLiveSection] = useState<LiveSection | null>(null);
  const [phaseMessage, setPhaseMessage] = useState<string | null>(null);
  const [dockOpen, setDockOpen] = useState(false);
  const [dockMinimized, setDockMinimized] = useState(false);
  const [derivativesOpen, setDerivativesOpen] = useState(false);
  // "Your book is ready": shown when writing finishes while the page is open.
  const [readyOpen, setReadyOpen] = useState(false);
  const [reelCreateOpen, setReelCreateOpen] = useState(false);
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [creatingEdition, setCreatingEdition] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [editions, setEditions] = useState<BookEdition[]>([]);
  const [audios, setAudios] = useState<BookAudioItem[]>([]);
  const [audioGeneratingType, setAudioGeneratingType] =
    useState<AudioDerivativeType | null>(null);
  const [audioPhaseMessage, setAudioPhaseMessage] = useState<string | null>(
    null
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState<
    "completed" | "failed" | "manual"
  >("completed");
  const [speedDialogOpen, setSpeedDialogOpen] = useState(false);
  const [premiumUpgradeOpen, setPremiumUpgradeOpen] = useState(false);
  const [premiumFeatureLabel, setPremiumFeatureLabel] = useState(
    "This feature is included on Pro and Premium."
  );
  const reviewPromptedRef = useRef(false);
  const audioWatchingRef = useRef(false);
  const liveRef = useRef<HTMLDivElement>(null);
  const { user, refresh: refreshUser } = useDashboardUser();

  const promptGenerationReview = useCallback(
    async (mode: "completed" | "failed") => {
      if (!id || reviewPromptedRef.current) return;
      if (wasReviewDismissed(id, mode)) return;
      try {
        const res = await fetch(`/api/books/${id}/feedback`);
        if (res.ok) {
          const data = await res.json();
          if (mode === "completed" && data.hasCompletedReview) return;
          if (mode === "failed" && data.hasFailedReview) return;
        }
      } catch {
        /* still prompt */
      }
      reviewPromptedRef.current = true;
      setReviewMode(mode);
      // Let success/error toasts settle first
      window.setTimeout(() => setReviewOpen(true), 700);
    },
    [id]
  );

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
    // Wait for DRAFT so create API can defer enqueue until speed is chosen.
    if (book.status === "DRAFT" || book.status === "FAILED" || book.status === "PAUSED") {
      autoStarted.current = true;
      setSpeedDialogOpen(true);
      // Drop ?generate=1 so refresh doesn't re-open forever.
      router.replace(`/dashboard/books/${book.id}`, { scroll: false });
    }
  }, [loading, book, searchParams, router]);

  useEffect(() => {
    if (loading || watchingRef.current || !book) return;
    const inProgress =
      book.status === "GENERATING" || book.status === "OUTLINING";
    if (inProgress && searchParams.get("generate") !== "1") {
      void subscribeToGeneration();
    }
  }, [loading, book?.status, searchParams]);

  // Fallback: keep progress bar fresh if SSE is quiet / background queue only.
  useEffect(() => {
    const inProgress =
      book?.status === "GENERATING" || book?.status === "OUTLINING";
    if (!inProgress || !id) return;

    let cancelled = false;
    async function pollProgress() {
      try {
        const res = await fetch(`/api/books/${id}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setBook((prev) =>
          prev
            ? {
                ...prev,
                progress: data.progress ?? prev.progress,
                currentPages: data.currentPages ?? prev.currentPages,
                status: data.status ?? prev.status,
                coverImage: data.coverImage ?? prev.coverImage,
              }
            : prev
        );
      } catch {
        // ignore
      }
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void pollProgress();
    }, 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [id, book?.status]);

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
        setReadyOpen(true);
      }
      void promptGenerationReview("completed");
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

  async function subscribeToGeneration(options?: {
    resetLive?: boolean;
    resume?: boolean;
    speed?: GenerationSpeed;
  }) {
    if (watchingRef.current) return;
    watchingRef.current = true;

    setGenerating(true);
    setDockOpen(true);
    setDockMinimized(true);
    if (options?.resetLive) {
      setLiveContent("");
      setLiveSection(null);
    }
    setPhaseMessage((prev) => prev ?? "Connecting to live generation…");

    try {
      const url = `/api/generate/${id}/stream${
        options?.resume ? "?resume=1" : ""
      }`;
      const res = await fetch(url, {
        method: "POST",
        headers: options?.speed
          ? { "Content-Type": "application/json" }
          : undefined,
        body: options?.speed
          ? JSON.stringify({ speed: options.speed })
          : undefined,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        if ((data as { paused?: boolean }).paused) {
          watchingRef.current = false;
          setGenerating(false);
          setPhaseMessage(null);
          setDockOpen(false);
          setDockMinimized(false);
          return;
        }
        const errMsg =
          (data as { error?: string }).error ?? "Generation failed";
        if (/insufficient page credits|pages remaining/i.test(errMsg)) {
          watchingRef.current = false;
          setGenerating(false);
          setPhaseMessage(null);
          setDockOpen(false);
          setDockMinimized(false);
          setBook((prev) =>
            prev
              ? {
                  ...prev,
                  status:
                    prev.status === "GENERATING" || prev.status === "OUTLINING"
                      ? "DRAFT"
                      : prev.status,
                }
              : prev
          );
          setPremiumFeatureLabel(errMsg);
          setPremiumUpgradeOpen(true);
          return;
        }
        throw new Error(errMsg);
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
        if (status !== "PAUSED") {
          if (/insufficient page credits|pages remaining/i.test(message)) {
            setPremiumFeatureLabel(message);
            setPremiumUpgradeOpen(true);
          } else {
            toast.error(message);
          }
        }
        await fetchBook();
        if (status === "FAILED") {
          void promptGenerationReview("failed");
        }
      }
    } finally {
      const status = await getBookStatus();
      if (status === "GENERATING" || status === "OUTLINING") {
        watchingRef.current = false;
        setTimeout(() => {
          void subscribeToGeneration({ resume: false });
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
          setReadyOpen(true);
        }
        void promptGenerationReview("completed");
      } else if (status === "FAILED") {
        void promptGenerationReview("failed");
      }
    }
  }

  async function startGeneration(speed?: GenerationSpeed) {
    if (!speed) {
      setSpeedDialogOpen(true);
      return;
    }

    const pagesRemaining =
      user != null ? Math.max(0, user.pagesLimit - user.pagesUsed) : null;
    if (
      book &&
      pagesRemaining != null &&
      book.targetPages > pagesRemaining
    ) {
      setPremiumFeatureLabel(
        `Insufficient page credits — you have ${pagesRemaining} pages remaining, but this book needs ${book.targetPages}. Upgrade for more monthly pages.`
      );
      setPremiumUpgradeOpen(true);
      return;
    }

    setSpeedDialogOpen(false);
    reviewPromptedRef.current = false;
    setPhaseMessage(
      speed === "super_fast"
        ? "Starting Super Fast…"
        : "Starting…"
    );
    setBook((prev) =>
      prev ? { ...prev, status: "GENERATING", errorMessage: null } : prev
    );
    const needsResume = book?.status === "PAUSED" || book?.status === "FAILED";
    await subscribeToGeneration({
      resetLive: true,
      resume: needsResume,
      speed,
    });
  }

  async function stopGeneration() {
    if (!book) return;
    setStopping(true);
    try {
      const res = await fetch(`/api/generate/${book.id}/cancel`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) {
        toast.error(data.error ?? "Could not stop generation");
        return;
      }
      toast.message(
        data.alreadyStopped ? "Generation already stopped" : "Stopping generation…"
      );
      setPhaseMessage("Generation stopped");
      setBook((prev) =>
        prev
          ? { ...prev, status: "PAUSED", errorMessage: "Generation stopped" }
          : prev
      );
      await fetchBook();
    } catch {
      toast.error("Failed to stop generation");
    } finally {
      setStopping(false);
    }
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
          : type === "SONG"
            ? "Writing and generating a song…"
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
      setPremiumFeatureLabel(
        "Private books are included on Pro ($20) and Premium ($30)."
      );
      setPremiumUpgradeOpen(true);
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

  const inProgress =
    generating || book.status === "GENERATING" || book.status === "OUTLINING";
  const isComplete = book.status === "COMPLETED";
  const canResume = book.status === "FAILED" || book.status === "PAUSED";
  const canStart = (book.status === "DRAFT" || canResume) && !generating;
  const canRegenerate =
    book.status === "COMPLETED" ||
    book.status === "DRAFT" ||
    book.status === "FAILED";
  const chapterCount = book.chapters.length;
  const chapterStates = book.chapters.map((chapter) =>
    chapterState(chapter, inProgress, liveSection?.chapterId)
  );
  const doneCount = chapterStates.filter((state) => state === "done").length;
  // Counted only once finished: while writing, this would rerun per token.
  const manuscriptWords = isComplete
    ? book.chapters.reduce(
        (total, chapter) =>
          total +
          chapter.sections.reduce((sum, s) => sum + countWords(s.content), 0),
        0
      )
    : 0;
  const progressLabel = inProgress
    ? phaseMessage ??
      (book.status === "OUTLINING" ? "Outlining chapters…" : "Writing…")
    : book.status === "PAUSED"
      ? "Paused"
      : book.status === "FAILED"
        ? "Stopped with an error"
        : "Not started yet";
  const languageLabel =
    BOOK_LANGUAGES.find((l) => l.value === book.language)?.label ??
    book.language;
  const settings = [
    {
      label: "Voice",
      value: `${POV_LABELS[book.pov] ?? book.pov}, ${book.tense}`,
    },
    {
      label: "Model",
      value: AI_MODELS.find((m) => m.value === book.model)?.label ?? book.model,
    },
    {
      label: "Creativity",
      value:
        CREATIVITY_LEVELS.find((c) => c.value === book.creativity)?.label ??
        String(book.creativity),
    },
    { label: "Language", value: languageLabel },
    { label: "Audience", value: book.audience ?? "—" },
    { label: "Dialogue", value: book.includeDialogue ? "On" : "Off" },
    { label: "Examples", value: book.includeExamples ? "On" : "Off" },
  ];

  return (
    <>
      <BookReadyDialog
        open={readyOpen}
        onOpenChange={setReadyOpen}
        bookId={book.id}
        title={book.title}
        coverImage={book.coverImage}
        chapters={doneCount}
        pages={book.currentPages}
        onCreateAudio={() => setDerivativesOpen(true)}
      />
      <BookDerivativesDialog
        open={derivativesOpen}
        onOpenChange={setDerivativesOpen}
        bookTitle={book.title}
        onStartAudio={startAudioGeneration}
        onOpenReel={() => setReelCreateOpen(true)}
        existingTypes={audios
          .filter((a) => a.status === "COMPLETED")
          .map((a) => a.type)}
      />

      <PremiumUpgradeDialog
        open={premiumUpgradeOpen}
        onOpenChange={setPremiumUpgradeOpen}
        featureLabel={premiumFeatureLabel}
      />
      <GenerationSpeedDialog
        open={speedDialogOpen}
        onOpenChange={setSpeedDialogOpen}
        busy={generating}
        resume={book?.status === "FAILED" || book?.status === "PAUSED"}
        canUseSuperFast={
          user?.plan === "PRO" ||
          user?.plan === "ENTERPRISE" ||
          user?.plan === "UNLIMITED"
        }
        onChoose={(speed) => {
          void startGeneration(speed);
        }}
      />      <GenerationReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        bookId={book.id}
        bookTitle={book.title}
        mode={reviewMode}
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

      <div className="space-y-8">
        <nav className="hidden min-w-0 items-center gap-1.5 text-[13px] text-[#697386] sm:flex">
          <Link
            href="/dashboard/books"
            className="inline-flex shrink-0 items-center gap-1 transition-colors hover:text-[#0a2540]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Your books
          </Link>
          <span className="text-[#c1c9d2]">/</span>
          <span className="truncate text-[#0a2540]">{book.title}</span>
        </nav>

        {/* Hero: a dark stage lit by the book's own cover */}
        <section className="relative isolate -mx-4 -mt-8 overflow-hidden bg-[#0a2540] px-5 pb-8 pt-16 text-white sm:mx-0 sm:mt-0 sm:rounded-3xl sm:px-8 sm:py-8 lg:px-10 lg:py-10">
          <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
            {book.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={book.coverImage}
                alt=""
                className="book-drift absolute inset-0 h-full w-full scale-125 object-cover opacity-80 blur-3xl saturate-150"
              />
            ) : (
              <div
                className="book-drift absolute inset-0 scale-125"
                style={{
                  background: `radial-gradient(circle at 30% 25%, ${genreColor(book.genre ?? "")} 0%, transparent 65%)`,
                }}
              />
            )}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,37,64,0.35)_0%,rgba(10,37,64,0.7)_55%,rgba(10,37,64,0.95)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.45)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.16),transparent_55%)] sm:bg-[radial-gradient(circle_at_14%_10%,rgba(255,255,255,0.16),transparent_45%)]" />
          </div>

          <Link
            href="/dashboard/books"
            aria-label="Your books"
            className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="grid items-center gap-6 text-center sm:grid-cols-[148px_minmax(0,1fr)] sm:text-left lg:grid-cols-[176px_minmax(0,1fr)] lg:gap-10">
            <div className="book-rise relative mx-auto w-[150px] sm:mx-0 sm:w-full">
              <div className="book-float relative">
                <BookCover
                  title={book.title}
                  coverImage={book.coverImage}
                  generating={coverGenerating || (!book.coverImage && inProgress)}
                  aspect="card"
                  className="w-full rounded-[3px_8px_8px_3px] shadow-[0_2px_6px_rgba(0,0,0,0.3),0_34px_60px_-24px_rgba(0,0,0,0.85)] ring-1 ring-white/10"
                />
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[3px_8px_8px_3px]">
                  <div className="book-sheen absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                </div>
              </div>
            </div>

            <div className="min-w-0">
              <StatusPill
                status={book.status}
                inProgress={inProgress}
                liveChapter={liveSection?.chapterNumber}
                chapterCount={chapterCount}
              />
              <h1
                className={cn(
                  serifDisplay.className,
                  "mt-3 text-[34px] font-normal leading-[1.05] tracking-[-0.01em] text-white sm:text-[40px] lg:text-[48px]"
                )}
              >
                {book.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13.5px] text-white/65 sm:justify-start">
                {(book.edition ?? 1) > 1 && (
                  <span className="rounded bg-white/10 px-2 py-0.5 text-[11.5px] font-medium text-[#c9c5ff]">
                    Edition {book.edition}
                  </span>
                )}
                <span className="sm:hidden">
                  {[book.genre, `${book.targetPages} pages`].filter(Boolean).join(" · ")}
                </span>
                <span className="hidden sm:inline">
                  {[book.genre, book.tone, `${book.targetPages} pages`, languageLabel]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              {book.description && (
                <>
                  <button
                    type="button"
                    aria-expanded={synopsisOpen}
                    onClick={() => setSynopsisOpen((open) => !open)}
                    className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-white/70 sm:hidden"
                  >
                    Synopsis
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        synopsisOpen && "rotate-180"
                      )}
                    />
                  </button>
                  <ExpandableDescription
                    text={book.description}
                    className={cn(
                      "mt-3 max-w-[620px] text-left text-[14.5px] leading-relaxed text-white/75 sm:mt-4 sm:block [&>button:last-child]:text-[#c9c5ff]",
                      synopsisOpen ? "block" : "hidden"
                    )}
                  />
                </>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {canStart && (
                  <Button
                    onClick={() => void startGeneration()}
                    className="h-10 rounded-full bg-[#635bff] px-5 text-[14px] text-white hover:bg-[#7a73ff]"
                  >
                    <Play className="h-3.5 w-3.5" />
                    {canResume ? "Resume writing" : "Start writing"}
                  </Button>
                )}
                {inProgress && dockOpen && (
                  <Button
                    onClick={() => setDockMinimized(false)}
                    className="h-10 rounded-full bg-[#635bff] px-5 text-[14px] text-white hover:bg-[#7a73ff]"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Watch it write
                  </Button>
                )}
                {isComplete && chapterCount > 0 && (
                  <Button
                    className="h-10 rounded-full bg-[#635bff] px-5 text-[14px] text-white hover:bg-[#7a73ff]"
                    asChild
                  >
                    <Link href={`/dashboard/books/${book.id}/read`}>
                      <BookOpen className="h-3.5 w-3.5" />
                      Read the book
                    </Link>
                  </Button>
                )}
                {isComplete && chapterCount > 0 && (
                  <Button variant="ghost" className={stageButton} asChild>
                    <a href={`/editor/${book.id}`} target="_blank" rel="noopener noreferrer">
                      <PenLine className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Open editor</span>
                    </a>
                  </Button>
                )}
                {!isComplete && !inProgress && chapterCount > 0 && (
                  <Button variant="ghost" className={stageButton} asChild>
                    <a
                      href={`/editor/${book.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Editor"
                    >
                      <PenLine className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Editor</span>
                    </a>
                  </Button>
                )}
                {isComplete && (
                  <Button
                    variant="ghost"
                    aria-label="Create audio"
                    onClick={() => setDerivativesOpen(true)}
                    className={stageButton}
                  >
                    <Headphones className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Create audio</span>
                  </Button>
                )}
                {inProgress && (
                  <Button
                    variant="ghost"
                    onClick={stopGeneration}
                    disabled={stopping}
                    className="h-10 rounded-full border border-[#ff6b81]/40 bg-[#df1b41]/15 px-4 text-[13.5px] text-[#ffb3c0] hover:bg-[#df1b41]/25 hover:text-[#ffd0d7]"
                  >
                    {stopping ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Square className="h-3 w-3 fill-current" />
                    )}
                    Stop
                  </Button>
                )}
                {!inProgress && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" aria-label="Export" className={stageButton}>
                        <Download className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Export</span>
                        <ChevronDown className="hidden h-3.5 w-3.5 opacity-70 sm:block" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-44">
                      <ExportItems bookId={book.id} />
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      aria-label="More actions"
                      className={cn(stageButton, "w-10 px-0 sm:px-0")}
                    >
                      <Ellipsis className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-52">
                    {inProgress && chapterCount > 0 && (
                      <DropdownMenuItem asChild>
                        <a href={`/editor/${book.id}`} target="_blank" rel="noopener noreferrer">
                          <PenLine className="h-4 w-4" />
                          Open editor
                        </a>
                      </DropdownMenuItem>
                    )}
                    {inProgress && (
                      <DropdownMenuItem onSelect={() => void fetchBook()}>
                        <RefreshCw className="h-4 w-4" />
                        Refresh progress
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      disabled={creatingEdition}
                      onSelect={() => void createEdition(true)}
                    >
                      {creatingEdition ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CopyPlus className="h-4 w-4" />
                      )}
                      New edition
                    </DropdownMenuItem>
                    {(chapterCount > 0 || book.coverImage) && (
                      <DropdownMenuItem
                        disabled={coverGenerating}
                        onSelect={() => void regenerateCover()}
                      >
                        <ImageIcon className="h-4 w-4" />
                        {book.coverImage ? "New cover" : "Generate cover"}
                      </DropdownMenuItem>
                    )}
                    {inProgress && (
                      <>
                        <DropdownMenuSeparator />
                        <ExportItems bookId={book.id} />
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => {
                        setReviewMode("manual");
                        setReviewOpen(true);
                      }}
                    >
                      <MessageSquareWarning className="h-4 w-4" />
                      Troubleshoot
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </section>

        {/* Progress while writing, stats once finished */}
        {isComplete ? (
          <section className="grid grid-cols-4 gap-2 sm:gap-3">
            {[
              { label: "Pages", value: String(book.currentPages || book.targetPages) },
              { label: "Words", value: formatWords(manuscriptWords) },
              { label: "Chapters", value: String(chapterCount) },
              { label: "Read", value: readingTime(manuscriptWords) },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl bg-[#f6f9fc] px-2 py-2.5 text-center sm:px-4 sm:py-3 sm:text-left"
              >
                <p className="text-[11px] text-[#697386] sm:text-[12px]">{stat.label}</p>
                <p className="mt-0.5 text-[17px] font-semibold tabular-nums tracking-[-0.02em] text-[#0a2540] sm:text-[22px]">
                  {stat.value}
                </p>
              </div>
            ))}
          </section>
        ) : (
          <section className="rounded-2xl border border-[#e6ebf1] bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
              <span className="min-w-0 truncate font-medium text-[#0a2540]">
                {progressLabel}
              </span>
              <span className="shrink-0 tabular-nums text-[#697386]">
                {Math.round(book.progress)}% · {book.currentPages}
                {book.targetPages > 0 ? ` of ${book.targetPages}` : ""} pages
              </span>
            </div>
            {chapterCount > 0 ? (
              <div className="mt-3 flex gap-1" aria-hidden>
                {chapterStates.map((state, index) => (
                  <span
                    key={book.chapters[index].id}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-colors duration-500",
                      state === "done" && "bg-[#635bff]",
                      state === "writing" && "animate-pulse bg-[#635bff]",
                      state === "pending" && "bg-[#e6ebf1]"
                    )}
                  />
                ))}
              </div>
            ) : (
              <Progress value={book.progress} className="mt-3 h-1.5" />
            )}
            {book.errorMessage && (
              <p className="mt-3 text-[13px] text-[#df1b41]">{book.errorMessage}</p>
            )}
          </section>
        )}

        {isComplete && book.errorMessage && (
          <div className="rounded-xl border border-[#f5c2cc] bg-[#fde8e8]/40 px-4 py-3">
            <p className="text-[13px] text-[#df1b41]">{book.errorMessage}</p>
          </div>
        )}

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_272px]">
          <div className="min-w-0 space-y-8">
            {isComplete && (
              <BookAudioPanel
                audios={audios}
                generatingType={audioGeneratingType}
                phaseMessage={audioPhaseMessage}
                onOpenStudio={() => setDerivativesOpen(true)}
                onPickType={(type) => {
                  if (type === "MUSIC") {
                    void startAudioGeneration(type).catch((error) => {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Failed to start audio generation"
                      );
                    });
                    return;
                  }
                  setDerivativesOpen(true);
                }}
              />
            )}

            {(isComplete || inProgress || doneCount > 0) && (
              <IllustrationsPanel
                bookId={book.id}
                enabled={Boolean(book.includeIllustrations)}
                canIllustrate={isComplete || doneCount > 0}
                generating={inProgress}
                onPicturesAdded={fetchBook}
              />
            )}

            {isComplete && (
              <StoryReelPanel
                bookId={book.id}
                bookTitle={book.title}
                chapters={book.chapters.map((chapter) => ({
                  id: chapter.id,
                  number: chapter.number,
                  title: chapter.title,
                  written: chapter.sections.some((section) => section.content?.trim()),
                }))}
                createOpen={reelCreateOpen}
                onCreateOpenChange={setReelCreateOpen}
              />
            )}

            <section>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#0a2540]">
                  Chapters
                </h2>
                {chapterCount > 0 && (
                  <span className="text-[13px] tabular-nums text-[#697386]">
                    {doneCount} of {chapterCount} written
                  </span>
                )}
              </div>

              {chapterCount === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#e6ebf1] px-6 py-12 text-center text-[14px] text-[#697386]">
                  {inProgress
                    ? "Outlining chapters… they’ll appear here in a moment."
                    : "No chapters yet. Start writing to create the outline."}
                </div>
              ) : (
                <ol className="overflow-hidden rounded-2xl border border-[#e6ebf1] bg-white">
                  {book.chapters.map((chapter, index) => {
                    const state = chapterStates[index];
                    const open = expanded === chapter.id;
                    return (
                      <li key={chapter.id} className="border-b border-[#eef1f5] last:border-0">
                        <div className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#f8fafc]">
                          <button
                            type="button"
                            aria-expanded={open}
                            onClick={() => setExpanded(open ? null : chapter.id)}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <span className="w-6 shrink-0 font-mono text-[12px] tabular-nums text-[#a3acb9]">
                              {String(chapter.number).padStart(2, "0")}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] font-medium text-[#0a2540]">
                                {chapter.title}
                              </span>
                              {chapter.summary && (
                                <span className="mt-0.5 hidden truncate text-[12.5px] text-[#697386] sm:block">
                                  {chapter.summary}
                                </span>
                              )}
                            </span>
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 shrink-0 text-[#a3acb9] transition-transform duration-200",
                                open && "rotate-180"
                              )}
                            />
                          </button>
                          {chapter.pageCount > 0 && (
                            <span className="hidden shrink-0 text-[12px] tabular-nums text-[#697386] sm:inline">
                              {chapter.pageCount} pp
                            </span>
                          )}
                          {canRegenerate && (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Regenerate chapter ${chapter.number}`}
                              className="h-7 w-7 p-0 text-[#697386] opacity-60 transition-opacity group-hover:opacity-100"
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
                          <ChapterStateIcon state={state} inProgress={inProgress} />
                        </div>

                        {open && (
                          <div className="space-y-4 border-t border-[#eef1f5] bg-[#f8fafc] px-4 py-4 sm:px-12">
                            {chapter.imageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={chapter.imageUrl}
                                alt={`Chapter ${chapter.number} illustration`}
                                loading="lazy"
                                className="aspect-[3/2] w-full rounded-lg bg-[#eef2f7] object-cover"
                              />
                            )}
                            {chapter.sections.map((section) => (
                              <div key={section.id}>
                                <p className="text-[12px] font-medium text-[#697386]">
                                  {section.title}
                                  {section.pageCount > 0 && ` · ${section.pageCount} pages`}
                                </p>
                                <BookManuscript
                                  className="mt-1"
                                  compact
                                  genre={book.genre}
                                  templateId={book.templateId}
                                  content={
                                    section.content ??
                                    (generating && liveSection?.sectionId === section.id
                                      ? liveContent
                                      : null) ??
                                    ""
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            {editions.length > 1 && (
              <section>
                <h2 className="mb-1 text-[17px] font-semibold tracking-[-0.02em] text-[#0a2540]">
                  Editions
                </h2>
                <p className="mb-3 text-[13px] text-[#697386]">
                  Each edition reuses the same premise and settings with a fresh
                  manuscript.
                </p>
                <ul className="divide-y divide-[#eef1f5] overflow-hidden rounded-2xl border border-[#e6ebf1] bg-white">
                  {editions.map((edition) => (
                    <li key={edition.id}>
                      <Link
                        href={`/dashboard/books/${edition.id}`}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#f8fafc]",
                          edition.id === book.id && "bg-[#f8f7ff]"
                        )}
                      >
                        <BookCover
                          title={edition.title}
                          coverImage={edition.coverImage}
                          aspect="compact"
                          className="w-[40px] shadow-sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium text-[#0a2540]">
                            {edition.title}
                          </p>
                          <p className="text-[12px] capitalize text-[#697386]">
                            Edition {edition.edition} · {edition.status.toLowerCase()}
                          </p>
                        </div>
                        {edition.id === book.id && (
                          <span className="shrink-0 text-[11.5px] font-medium text-[#635bff]">
                            Viewing
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(book.characters?.length || book.themes?.length || book.customInstructions) && (
              <section className="space-y-4 rounded-2xl border border-[#e6ebf1] bg-white p-5">
                <h2 className="text-[15px] font-semibold text-[#0a2540]">Story notes</h2>
                {book.characters && book.characters.length > 0 && (
                  <div>
                    <p className="text-[12px] font-medium text-[#697386]">Characters</p>
                    <ul className="mt-1 space-y-1 text-[13.5px] text-[#425466]">
                      {book.characters.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {book.themes && book.themes.length > 0 && (
                  <div>
                    <p className="text-[12px] font-medium text-[#697386]">Themes</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {book.themes.map((theme) => (
                        <span
                          key={theme}
                          className="rounded-full bg-[#f6f9fc] px-2.5 py-1 text-[12.5px] text-[#425466]"
                        >
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {book.customInstructions && (
                  <div>
                    <p className="text-[12px] font-medium text-[#697386]">Instructions</p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-[#425466]">
                      {book.customInstructions}
                    </p>
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-20">
            <div className="rounded-2xl border border-[#e6ebf1] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[14px] font-semibold text-[#0a2540]">
                    {book.isPublic ? (
                      <Globe className="h-4 w-4 text-[#0e6245]" />
                    ) : (
                      <Lock className="h-4 w-4 text-[#697386]" />
                    )}
                    {book.isPublic ? "Public" : "Private"}
                  </p>
                  <p className="mt-0.5 hidden text-[12.5px] text-[#697386] sm:block">
                    {book.isPublic ? "Listed in the library and search" : "Only you can see it"}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={book.isPublic}
                  aria-label="Public book"
                  disabled={togglingVisibility}
                  onClick={toggleVisibility}
                  className={cn(
                    "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors duration-200 disabled:opacity-60",
                    book.isPublic ? "bg-[#635bff]" : "bg-[#e6ebf1]"
                  )}
                >
                  <span
                    className={cn(
                      "h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                      book.isPublic && "translate-x-4"
                    )}
                  />
                </button>
              </div>
              <p className="mt-3 hidden truncate font-mono text-[11.5px] text-[#a3acb9] sm:block">
                {book.slug}
              </p>
              {book.isPublic && book.slug && (
                <a
                  href={`/books/${book.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-[#635bff] hover:underline"
                >
                  View public page
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {book.isPublic && !book.canMakePrivate && (
                <button
                  type="button"
                  onClick={() => {
                    setPremiumFeatureLabel(
                      "Private books are included on Pro ($20) and Premium ($30)."
                    );
                    setPremiumUpgradeOpen(true);
                  }}
                  className="mt-2 block text-[12px] text-[#697386] hover:text-[#635bff]"
                >
                  Private books need Pro →
                </button>
              )}
            </div>

            {/* Collapsed on phones, always open from sm up. */}
            <details className="group rounded-2xl border border-[#e6ebf1] bg-white px-4 py-3 sm:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-semibold text-[#0a2540] [&::-webkit-details-marker]:hidden">
                Settings
                <ChevronDown className="h-4 w-4 text-[#a3acb9] transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <SettingsList rows={settings} />
            </details>
            <div className="hidden rounded-2xl border border-[#e6ebf1] bg-white px-4 pb-2 pt-4 sm:block">
              <p className="text-[14px] font-semibold text-[#0a2540]">Settings</p>
              <SettingsList rows={settings} />
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

function StatusPill({
  status,
  inProgress,
  liveChapter,
  chapterCount,
}: {
  status: string;
  inProgress: boolean;
  liveChapter?: number;
  chapterCount: number;
}) {
  if (inProgress) {
    const label =
      status === "OUTLINING" || chapterCount === 0
        ? "Outlining chapters"
        : liveChapter
          ? `Writing chapter ${liveChapter} of ${chapterCount}`
          : "Writing";
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12.5px] font-medium text-[#c9c5ff]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#a5a0ff]" />
        {label}
      </span>
    );
  }
  if (status === "COMPLETED") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0e6245]/35 px-3 py-1 text-[12.5px] font-medium text-[#9ff0c0]">
        <CircleCheck className="h-3.5 w-3.5" />
        Finished{chapterCount > 0 ? ` · ${chapterCount} chapters` : ""}
      </span>
    );
  }
  const tone =
    status === "FAILED"
      ? "bg-[#df1b41]/20 text-[#ffb3c0]"
      : status === "PAUSED"
        ? "bg-[#9a6700]/30 text-[#fcd77a]"
        : "bg-white/10 text-white/75";
  const label = status === "FAILED" ? "Failed" : status === "PAUSED" ? "Paused" : "Draft";
  return (
    <span className={cn("inline-flex rounded-full px-3 py-1 text-[12.5px] font-medium", tone)}>
      {label}
    </span>
  );
}

function ChapterStateIcon({
  state,
  inProgress,
}: {
  state: ChapterState;
  inProgress: boolean;
}) {
  if (state === "done") {
    return <CircleCheck aria-label="Written" className="h-4 w-4 shrink-0 text-[#0e6245]" />;
  }
  if (state === "writing") {
    return (
      <LoaderCircle aria-label="Writing" className="h-4 w-4 shrink-0 animate-spin text-[#635bff]" />
    );
  }
  return (
    <Clock
      aria-label={inProgress ? "Queued" : "Not written yet"}
      className="h-4 w-4 shrink-0 text-[#c1c9d2]"
    />
  );
}

function SettingsList({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="mt-2 divide-y divide-[#eef1f5]">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-3 py-2 text-[13px]"
        >
          <dt className="shrink-0 text-[#697386]">{row.label}</dt>
          <dd className="truncate text-right font-medium text-[#0a2540]">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ExportItems({ bookId }: { bookId: string }) {
  return (
    <>
      <DropdownMenuItem asChild>
        <a href={`/api/books/${bookId}/export?format=pdf`}>
          <Download className="h-4 w-4" />
          PDF (.pdf)
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a href={`/api/books/${bookId}/export?format=epub`}>
          <Download className="h-4 w-4" />
          EPUB (.epub)
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a href={`/api/books/${bookId}/export?format=md`}>
          <Download className="h-4 w-4" />
          Markdown (.md)
        </a>
      </DropdownMenuItem>
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
