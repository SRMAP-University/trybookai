"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bold,
  BookOpen,
  Check,
  CloudOff,
  Focus,
  Heading2,
  Italic,
  List,
  Loader2,
  Quote,
  Search,
  Sparkles,
  Type,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { countWords, formatWords } from "@/lib/reading-stats";
import type { SaveStatus } from "@/lib/book-editor/utils";
import type { EditorAiAction } from "@/lib/book-editor/assist";
import { serifDisplay } from "@/components/marketing/home/fonts";
import { manuscriptSerif } from "@/components/dashboard/editor/editor-fonts";
import {
  AiPanel,
  FindPanel,
  ManuscriptTextarea,
  Outline,
  RenderedSection,
  SELECTION_ACTIONS,
  SuggestionCard,
  TEXT_SIZES,
  TextSettingsMenu,
  type EditorChapter,
  type Suggestion,
  type TextFont,
  type TextSize,
} from "@/components/dashboard/editor/editor-panels";
import { sourceOffsetFromDom } from "@/components/dashboard/editor/dom-offsets";

type Book = {
  id: string;
  title: string;
  status: string;
  wordsPerPage: number;
  chapters: EditorChapter[];
};

type TextRange = { sectionId: string; start: number; end: number };
/** Where a selection was made: the raw editor, or the formatted reading view. */
type Selection = TextRange & { source: "textarea" | "rendered" };
type FormatKind = "bold" | "italic" | "heading" | "list" | "quote";

type AiRequest = {
  action: EditorAiAction;
  sectionId: string;
  selectionStart?: number;
  selectionEnd?: number;
  instruction?: string;
};

const SAVE_DELAY_MS = 900;

const ACTION_LABELS: Record<EditorAiAction, string> = {
  rewrite: "Rewrite",
  expand: "Expand",
  shorten: "Shorten",
  fix_grammar: "Fix grammar",
  continue: "Continue writing",
  regenerate_section: "Regenerate section",
  custom: "Ask",
};

const NEEDS_SELECTION = new Set<EditorAiAction>([
  "rewrite",
  "expand",
  "shorten",
  "fix_grammar",
]);

function parseSseChunk(buffer: string) {
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

/** Scrolls so a character offset inside an auto-sized text area is in view. */
function revealOffset(
  container: HTMLElement,
  el: HTMLTextAreaElement,
  offset: number
) {
  const ratio = offset / Math.max(1, el.value.length);
  const top = el.getBoundingClientRect().top + ratio * el.scrollHeight;
  const view = container.getBoundingClientRect();
  if (top < view.top + 80 || top > view.bottom - 160) {
    container.scrollTo({
      top: Math.max(0, container.scrollTop + top - view.top - 160),
      behavior: "smooth",
    });
  }
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* Text size and font are a per-browser convenience, kept in localStorage. */

const PREFS_KEY = "bookai_editor_text_v1";
const PREFS_EVENT = "bookai-editor-prefs";
let memoryPrefs = "";

function readPrefs() {
  try {
    return localStorage.getItem(PREFS_KEY) ?? memoryPrefs;
  } catch {
    return memoryPrefs;
  }
}

function subscribePrefs(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(PREFS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PREFS_EVENT, onChange);
  };
}

function useEditorPrefs() {
  const raw = useSyncExternalStore(subscribePrefs, readPrefs, () => "");
  const prefs = useMemo(() => {
    let parsed: { size?: string; font?: string } = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      /* ignore */
    }
    const size: TextSize =
      parsed.size === "sm" || parsed.size === "lg" ? parsed.size : "md";
    const font: TextFont = parsed.font === "sans" ? "sans" : "serif";
    return { size, font };
  }, [raw]);

  const update = useCallback(
    (next: Partial<{ size: TextSize; font: TextFont }>) => {
      const value = JSON.stringify({ ...prefs, ...next });
      memoryPrefs = value;
      try {
        localStorage.setItem(PREFS_KEY, value);
      } catch {
        /* storage unavailable: memoryPrefs still applies */
      }
      window.dispatchEvent(new Event(PREFS_EVENT));
    },
    [prefs]
  );

  return [prefs, update] as const;
}

export function BookEditor({ book }: { book: Book }) {
  const sections = useMemo(
    () =>
      book.chapters.flatMap((chapter) =>
        chapter.sections.map((section) => ({
          ...section,
          chapterNumber: chapter.number,
        }))
      ),
    [book.chapters]
  );

  const [initial] = useState(() => ({
    contents: Object.fromEntries(sections.map((s) => [s.id, s.content ?? ""])),
    titles: Object.fromEntries(sections.map((s) => [s.id, s.title])),
  }));
  const [contents, setContents] = useState<Record<string, string>>(
    initial.contents
  );
  const [titles, setTitles] = useState<Record<string, string>>(initial.titles);
  const contentsRef = useRef(initial.contents);
  const titlesRef = useRef(initial.titles);
  const savedRef = useRef<Record<string, { content: string; title: string }>>(
    Object.fromEntries(
      sections.map((s) => [s.id, { content: s.content ?? "", title: s.title }])
    )
  );
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [sectionSave, setSectionSave] = useState<
    Record<string, "unsaved" | "saving" | "error">
  >({});

  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? "");
  const [selection, setSelection] = useState<Selection | null>(null);
  // Only one section shows raw Markdown at a time; the rest render formatted.
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const pendingFocusRef = useRef<TextRange | null>(null);
  // Touch screens pick paragraphs by tap instead of native text selection.
  const coarsePointerRef = useRef(false);
  const pickedBlockRef = useRef<HTMLElement | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const suggestionIdRef = useRef(0);
  const suggestionOpenRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const [aiOpen, setAiOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [sheet, setSheet] = useState<null | "contents" | "ai">(null);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [viewportKey, setViewportKey] = useState(0);
  const [prefs, setPrefs] = useEditorPrefs();

  const textareasRef = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const blocksRef = useRef<Record<string, HTMLElement | null>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const askRef = useRef<HTMLTextAreaElement>(null);
  const askSheetRef = useRef<HTMLTextAreaElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);

  const canEdit = book.status !== "GENERATING" && book.status !== "OUTLINING";
  const busy = suggestion?.status === "streaming";

  const wordCounts = useMemo(
    () =>
      Object.fromEntries(
        sections.map((s) => [s.id, countWords(contents[s.id])])
      ) as Record<string, number>,
    [sections, contents]
  );
  const bookWords = useMemo(
    () => Object.values(wordCounts).reduce((sum, n) => sum + n, 0),
    [wordCounts]
  );

  const saveStates = Object.values(sectionSave);
  const saveStatus: SaveStatus = saveStates.includes("error")
    ? "error"
    : saveStates.includes("saving")
      ? "saving"
      : saveStates.includes("unsaved")
        ? "unsaved"
        : "saved";

  /* ------------------------------ Saving -------------------------------- */

  const saveSection = useCallback(
    async (sectionId: string) => {
      const content = contentsRef.current[sectionId] ?? "";
      const saved = savedRef.current[sectionId];
      const typedTitle = (titlesRef.current[sectionId] ?? "").trim();
      // An emptied title keeps the last saved one rather than failing validation.
      const title = typedTitle || saved?.title || "";

      if (saved && saved.content === content && saved.title === title) {
        setSectionSave((prev) => {
          if (!(sectionId in prev)) return prev;
          const next = { ...prev };
          delete next[sectionId];
          return next;
        });
        return;
      }

      setSectionSave((prev) => ({ ...prev, [sectionId]: "saving" }));
      try {
        const res = await fetch(`/api/books/${book.id}/sections/${sectionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            title && title !== saved?.title ? { content, title } : { content }
          ),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            typeof data.error === "string" ? data.error : "Couldn’t save"
          );
        }
        savedRef.current[sectionId] = { content, title };
        setSectionSave((prev) => {
          const next = { ...prev };
          const stillCurrent =
            (contentsRef.current[sectionId] ?? "") === content &&
            ((titlesRef.current[sectionId] ?? "").trim() || title) === title;
          if (stillCurrent) delete next[sectionId];
          else next[sectionId] = "unsaved";
          return next;
        });
      } catch (error) {
        setSectionSave((prev) => ({ ...prev, [sectionId]: "error" }));
        toast.error(error instanceof Error ? error.message : "Couldn’t save");
      }
    },
    [book.id]
  );

  const scheduleSave = useCallback(
    (sectionId: string) => {
      setSectionSave((prev) =>
        prev[sectionId] === "unsaved" ? prev : { ...prev, [sectionId]: "unsaved" }
      );
      clearTimeout(timersRef.current[sectionId]);
      timersRef.current[sectionId] = setTimeout(
        () => void saveSection(sectionId),
        SAVE_DELAY_MS
      );
    },
    [saveSection]
  );

  const saveAllNow = useCallback(() => {
    for (const timer of Object.values(timersRef.current)) clearTimeout(timer);
    timersRef.current = {};
    for (const section of sections) void saveSection(section.id);
  }, [sections, saveSection]);

  const updateContent = useCallback(
    (sectionId: string, value: string) => {
      contentsRef.current = { ...contentsRef.current, [sectionId]: value };
      setContents((prev) => ({ ...prev, [sectionId]: value }));
      scheduleSave(sectionId);
    },
    [scheduleSave]
  );

  const updateTitle = useCallback(
    (sectionId: string, value: string) => {
      titlesRef.current = { ...titlesRef.current, [sectionId]: value };
      setTitles((prev) => ({ ...prev, [sectionId]: value }));
      scheduleSave(sectionId);
    },
    [scheduleSave]
  );

  /* --------------------------- Text area hooks -------------------------- */

  const handleSelectRange = useCallback(
    (sectionId: string, start: number, end: number) => {
      setActiveSectionId(sectionId);
      setSelection(
        start !== end ? { sectionId, start, end, source: "textarea" } : null
      );
    },
    []
  );
  const handleFocusSection = useCallback(
    (sectionId: string) => setActiveSectionId(sectionId),
    []
  );
  const registerTextarea = useCallback(
    (sectionId: string, el: HTMLTextAreaElement | null) => {
      textareasRef.current[sectionId] = el;
    },
    []
  );

  /* ------------------------- Formatted ⇄ editing ------------------------ */

  const startEditing = useCallback(
    (sectionId: string, start: number, end = start) => {
      if (!canEdit) return;
      setEditingSectionId(sectionId);
      setActiveSectionId(sectionId);
      setSelection(null);
      pendingFocusRef.current = { sectionId, start, end };
    },
    [canEdit]
  );

  // Once the text area mounts, put the caret (or a find match) where asked.
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending || pending.sectionId !== editingSectionId) return;
    pendingFocusRef.current = null;
    const el = textareasRef.current[pending.sectionId];
    const container = scrollRef.current;
    if (!el || !container) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(pending.start, pending.end);
    revealOffset(container, el, pending.start);
  }, [editingSectionId]);

  const handleRenderedPointerUp = useCallback(
    (sectionId: string, container: HTMLElement, target: EventTarget | null) => {
      if (coarsePointerRef.current) {
        if (!canEdit || suggestion?.sectionId === sectionId) return;
        const block =
          target instanceof Element
            ? target.closest<HTMLElement>(
                "p, li, h1, h2, h3, h4, blockquote, td, th, figcaption"
              )
            : null;
        if (!block || !container.contains(block) || block === pickedBlockRef.current) {
          setSelection(null);
          return;
        }
        const source = contentsRef.current[sectionId] ?? "";
        const a = sourceOffsetFromDom(container, block, 0, source);
        const b = sourceOffsetFromDom(container, block, block.childNodes.length, source);
        if (a === null || b === null || a === b) return;
        pickedBlockRef.current?.removeAttribute("data-picked");
        block.setAttribute("data-picked", "");
        pickedBlockRef.current = block;
        setActiveSectionId(sectionId);
        setSelection({
          sectionId,
          start: Math.min(a, b),
          end: Math.max(a, b),
          source: "rendered",
        });
        return;
      }

      const domSelection = window.getSelection();
      // Drag-selections are handled by the selectionchange listener.
      if (!canEdit || (domSelection && !domSelection.isCollapsed)) return;
      if (suggestion?.sectionId === sectionId) return;
      const source = contentsRef.current[sectionId] ?? "";
      const offset =
        sourceOffsetFromDom(
          container,
          domSelection?.anchorNode ?? null,
          domSelection?.anchorOffset ?? 0,
          source
        ) ?? source.length;
      startEditing(sectionId, offset);
    },
    [canEdit, startEditing, suggestion?.sectionId]
  );

  const handleRequestEdit = useCallback(
    (sectionId: string) =>
      startEditing(sectionId, (contentsRef.current[sectionId] ?? "").length),
    [startEditing]
  );

  const handleBlurSection = useCallback((sectionId: string) => {
    setEditingSectionId((current) => (current === sectionId ? null : current));
  }, []);

  // Selecting formatted text (mouse or long-press) maps back to the source,
  // so AI actions work without opening the raw editor.
  useEffect(() => {
    let frame = 0;
    const onSelectionChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const domSelection = window.getSelection();
        const anchor = domSelection?.anchorNode ?? null;
        const anchorEl =
          anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
        const container = anchorEl?.closest<HTMLElement>("[data-rendered-section]");
        if (
          !domSelection ||
          domSelection.isCollapsed ||
          !container ||
          !container.contains(domSelection.focusNode)
        ) {
          // A click elsewhere in the manuscript drops a formatted-text selection;
          // focusing the AI box or find bar keeps it.
          if (!coarsePointerRef.current && anchorEl?.closest("[data-manuscript]")) {
            setSelection((prev) => (prev?.source === "rendered" ? null : prev));
          }
          return;
        }
        const sectionId = container.dataset.renderedSection ?? "";
        const source = contentsRef.current[sectionId] ?? "";
        const a = sourceOffsetFromDom(
          container,
          domSelection.anchorNode,
          domSelection.anchorOffset,
          source
        );
        const b = sourceOffsetFromDom(
          container,
          domSelection.focusNode,
          domSelection.focusOffset,
          source
        );
        if (a === null || b === null || a === b) return;
        setActiveSectionId(sectionId);
        setSelection({
          sectionId,
          start: Math.min(a, b),
          end: Math.max(a, b),
          source: "rendered",
        });
      });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, []);

  /** Wraps or prefixes the selection with Markdown, so authors never type it. */
  function applyFormat(kind: FormatKind) {
    const sectionId = editingSectionId;
    const el = sectionId ? textareasRef.current[sectionId] : null;
    if (!sectionId || !el) return;
    const text = el.value;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    let next: string;
    let nextStart: number;
    let nextEnd: number;

    if (kind === "bold" || kind === "italic") {
      const mark = kind === "bold" ? "**" : "*";
      const selected = text.slice(start, end) || (kind === "bold" ? "bold" : "italic");
      next = text.slice(0, start) + mark + selected + mark + text.slice(end);
      nextStart = start + mark.length;
      nextEnd = nextStart + selected.length;
    } else {
      const prefix = kind === "heading" ? "## " : kind === "list" ? "- " : "> ";
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      const lineEndIndex = text.indexOf("\n", end);
      const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
      const lines = text.slice(lineStart, lineEnd).split("\n");
      const allPrefixed = lines.every((line) => line.startsWith(prefix));
      const block = lines
        .map((line) =>
          allPrefixed
            ? line.slice(prefix.length)
            : prefix + line.replace(/^(#{1,6}\s|[-*]\s|>\s)/, "")
        )
        .join("\n");
      next = text.slice(0, lineStart) + block + text.slice(lineEnd);
      nextStart = lineStart;
      nextEnd = lineStart + block.length;
    }

    updateContent(sectionId, next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextStart, nextEnd);
    });
  }

  function handleTextareaKeyDown(
    _sectionId: string,
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === "b" || key === "i") {
      event.preventDefault();
      applyFormat(key === "b" ? "bold" : "italic");
    }
  }

  /* -------------------------------- AI ---------------------------------- */

  async function requestSuggestion(req: AiRequest) {
    if (!canEdit) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = ++suggestionIdRef.current;

    const baseContent = contentsRef.current[req.sectionId] ?? "";
    const hasRange =
      req.selectionStart !== undefined &&
      req.selectionEnd !== undefined &&
      req.selectionStart !== req.selectionEnd;
    const start = hasRange ? req.selectionStart : undefined;
    const end = hasRange ? req.selectionEnd : undefined;

    setSuggestion({
      id,
      action: req.action,
      label:
        req.action === "custom" ? `Ask · ${req.instruction}` : ACTION_LABELS[req.action],
      sectionId: req.sectionId,
      baseContent,
      selectionStart: start,
      selectionEnd: end,
      instruction: req.instruction,
      text: "",
      merged: null,
      status: "streaming",
    });
    // Batch streamed tokens into one state update per frame.
    let buffered = "";
    let frame: number | null = null;
    const flush = () => {
      frame = null;
      const chunk = buffered;
      buffered = "";
      if (!chunk) return;
      setSuggestion((s) => (s && s.id === id ? { ...s, text: s.text + chunk } : s));
    };

    let finished = false;
    try {
      const res = await fetch(`/api/books/${book.id}/ai/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          action: req.action,
          sectionId: req.sectionId,
          content: baseContent,
          selection:
            start !== undefined && end !== undefined
              ? baseContent.slice(start, end)
              : undefined,
          selectionStart: start,
          selectionEnd: end,
          instruction: req.instruction,
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "AI failed");
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
          if (evt.type === "token") {
            buffered += String(evt.data.text ?? "");
            if (frame === null) frame = requestAnimationFrame(flush);
          }
          if (evt.type === "done") {
            if (frame !== null) cancelAnimationFrame(frame);
            flush();
            finished = true;
            const merged = String(evt.data.content ?? "");
            setSuggestion((s) =>
              s && s.id === id ? { ...s, merged, status: "ready" } : s
            );
          }
          if (evt.type === "error") {
            throw new Error(String(evt.data.message ?? "AI failed"));
          }
        }
      }
      if (!finished) throw new Error("The AI stopped before finishing. Try again.");
    } catch (error) {
      if (controller.signal.aborted) return;
      if (frame !== null) cancelAnimationFrame(frame);
      setSuggestion((s) =>
        s && s.id === id
          ? {
              ...s,
              status: "error",
              error: error instanceof Error ? error.message : "AI failed",
            }
          : s
      );
    }
  }

  function runAction(action: EditorAiAction, instruction?: string) {
    if (!canEdit || busy) return;
    if (NEEDS_SELECTION.has(action) && !selection) {
      toast.error("Select some text first");
      return;
    }
    const sectionId = selection?.sectionId ?? activeSectionId;
    const useRange =
      selection !== null && (NEEDS_SELECTION.has(action) || action === "custom");
    setSheet(null);
    void requestSuggestion({
      action,
      sectionId,
      instruction,
      selectionStart: useRange ? selection.start : undefined,
      selectionEnd: useRange ? selection.end : undefined,
    });
  }

  function retrySuggestion() {
    if (!suggestion) return;
    void requestSuggestion({
      action: suggestion.action,
      sectionId: suggestion.sectionId,
      selectionStart: suggestion.selectionStart,
      selectionEnd: suggestion.selectionEnd,
      instruction: suggestion.instruction,
    });
  }

  function acceptSuggestion() {
    const s = suggestion;
    if (!s || s.merged === null) return;
    const previous = contentsRef.current[s.sectionId] ?? "";
    updateContent(s.sectionId, s.merged);
    setSuggestion(null);
    setSelection(null);
    toast.success("Edit applied", {
      action: {
        label: "Undo",
        onClick: () => updateContent(s.sectionId, previous),
      },
    });
  }

  function discardSuggestion() {
    abortRef.current?.abort();
    setSuggestion(null);
  }

  function openAsk() {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setAiOpen(true);
      setFocusMode(false);
      requestAnimationFrame(() => askRef.current?.focus());
    } else {
      setSheet("ai");
      setTimeout(() => askSheetRef.current?.focus(), 250);
    }
  }

  /* --------------------------- Find & replace --------------------------- */

  const matches = useMemo(() => {
    if (!query) return [] as TextRange[];
    const pattern = new RegExp(escapeRegExp(query), "gi");
    const found: TextRange[] = [];
    for (const section of sections) {
      for (const m of (contents[section.id] ?? "").matchAll(pattern)) {
        found.push({
          sectionId: section.id,
          start: m.index,
          end: m.index + m[0].length,
        });
        if (found.length >= 2000) return found;
      }
    }
    return found;
  }, [query, contents, sections]);
  const currentMatchIndex = matches.length
    ? Math.min(matchIndex, matches.length - 1)
    : 0;

  function goToMatch(index: number) {
    if (!matches.length) return;
    const i = (index + matches.length) % matches.length;
    setMatchIndex(i);
    const match = matches[i];
    if (suggestion?.sectionId === match.sectionId) return;
    if (editingSectionId === match.sectionId) {
      // Already open: select in place (the layout effect only runs on switch).
      const el = textareasRef.current[match.sectionId];
      if (el && scrollRef.current) {
        el.focus({ preventScroll: true });
        el.setSelectionRange(match.start, match.end);
        revealOffset(scrollRef.current, el, match.start);
      }
      return;
    }
    startEditing(match.sectionId, match.start, match.end);
  }

  function replaceCurrent() {
    const match = matches[currentMatchIndex];
    if (!match) return;
    if (suggestion?.sectionId === match.sectionId) {
      toast.error("Finish the AI suggestion in this section first");
      return;
    }
    const text = contentsRef.current[match.sectionId] ?? "";
    updateContent(
      match.sectionId,
      text.slice(0, match.start) + replacement + text.slice(match.end)
    );
  }

  function replaceAll() {
    if (!query || !matches.length) return;
    const pattern = new RegExp(escapeRegExp(query), "gi");
    let count = 0;
    for (const sectionId of new Set(matches.map((m) => m.sectionId))) {
      if (suggestion?.sectionId === sectionId) continue;
      const text = contentsRef.current[sectionId] ?? "";
      const next = text.replace(pattern, () => {
        count += 1;
        return replacement;
      });
      if (next !== text) updateContent(sectionId, next);
    }
    toast.success(`Replaced ${count} ${count === 1 ? "match" : "matches"}`);
  }

  function openFind() {
    setFindOpen(true);
    requestAnimationFrame(() => findInputRef.current?.focus());
  }

  /* ---------------------------- Navigation ------------------------------ */

  function jumpToSection(sectionId: string) {
    setSheet(null);
    setEditingSectionId(null);
    setActiveSectionId(sectionId);
    blocksRef.current[sectionId]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  // While reading (no text area focused), the outline follows the scroll.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (document.activeElement instanceof HTMLTextAreaElement) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const id = visible?.target.getAttribute("data-section-id");
        if (id) setActiveSectionId(id);
      },
      { root, rootMargin: "-15% 0px -70% 0px" }
    );
    for (const el of Object.values(blocksRef.current)) if (el) io.observe(el);
    return () => io.disconnect();
  }, [sections]);

  // Re-measure text areas when the width changes (wrapping changes height).
  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setViewportKey((k) => k + 1));
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
        requestAnimationFrame(() => findInputRef.current?.focus());
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveAllNow();
      } else if (e.key === "Escape") {
        if (suggestionOpenRef.current) {
          abortRef.current?.abort();
          setSuggestion(null);
          return;
        }
        setFindOpen(false);
        setFocusMode(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveAllNow]);

  useEffect(() => {
    suggestionOpenRef.current = suggestion !== null;
  }, [suggestion]);

  useEffect(() => {
    coarsePointerRef.current = window.matchMedia("(pointer: coarse)").matches;
  }, []);

  useEffect(() => {
    if (selection?.source === "rendered" || suggestion) return;
    pickedBlockRef.current?.removeAttribute("data-picked");
    pickedBlockRef.current = null;
  }, [selection, suggestion]);

  useEffect(() => {
    if (saveStatus === "saved") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveStatus]);

  /* ------------------------------ Render -------------------------------- */

  const activeSection =
    sections.find((s) => s.id === activeSectionId) ?? sections[0];
  const selectionText = selection
    ? (contents[selection.sectionId] ?? "").slice(selection.start, selection.end)
    : null;
  const fontClass =
    prefs.font === "serif" ? manuscriptSerif.className : "font-sans";
  const layoutKey = `${prefs.size}-${prefs.font}-${viewportKey}`;

  const aiPanelProps = {
    canEdit,
    busy,
    selectionText,
    sectionWords: wordCounts[activeSectionId] ?? 0,
    wordsPerPage: book.wordsPerPage,
    bookWords,
    onAction: (action: EditorAiAction) => runAction(action),
    onAsk: (instruction: string) => runAction("custom", instruction),
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-white">
      <header
        className={cn(
          "z-20 flex h-14 shrink-0 items-center gap-1.5 border-b border-[#eef1f5] bg-white px-2 transition-opacity duration-300 sm:gap-2 sm:px-4",
          focusMode && "opacity-40 hover:opacity-100"
        )}
      >
        <Link
          href={`/dashboard/books/${book.id}`}
          aria-label="Back to book"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#425466] transition-colors hover:bg-[#f6f9fc] hover:text-[#0a2540]"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-[#0a2540]">
            <span className="hidden sm:inline">{book.title}</span>
            <span className="sm:hidden">
              {(activeSection && titles[activeSection.id]) || book.title}
            </span>
          </p>
          {activeSection && (
            <p className="hidden truncate text-[12px] text-[#697386] sm:block">
              Chapter {activeSection.chapterNumber} ·{" "}
              {titles[activeSection.id] || `Section ${activeSection.number}`}
            </p>
          )}
        </div>

        <SaveIndicator status={saveStatus} onRetry={saveAllNow} />
        <span className="hidden px-2 text-[12px] tabular-nums text-[#697386] xl:inline">
          {formatWords(bookWords)} words
        </span>

        <div className="hidden items-center gap-0.5 sm:flex">
          <HeaderButton
            label="Contents"
            onClick={() => setSheet("contents")}
            className="lg:hidden"
          >
            <BookOpen className="h-4 w-4" />
          </HeaderButton>
          <HeaderButton
            label="Find and replace"
            active={findOpen}
            onClick={() => (findOpen ? setFindOpen(false) : openFind())}
          >
            <Search className="h-4 w-4" />
          </HeaderButton>
          <TextSettingsMenu
            size={prefs.size}
            font={prefs.font}
            onSize={(size) => setPrefs({ size })}
            onFont={(font) => setPrefs({ font })}
          />
          <HeaderButton
            label="Focus mode"
            active={focusMode}
            onClick={() => setFocusMode((v) => !v)}
            className="hidden lg:flex"
          >
            <Focus className="h-4 w-4" />
          </HeaderButton>
          <button
            type="button"
            onClick={() => {
              if (window.matchMedia("(min-width: 1024px)").matches) {
                setAiOpen((v) => !v || focusMode);
                setFocusMode(false);
              } else {
                setSheet("ai");
              }
            }}
            className={cn(
              "ml-1 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
              aiOpen && !focusMode
                ? "bg-[#635bff] text-white hover:bg-[#5851e5]"
                : "border border-[#e6ebf1] text-[#0a2540] hover:bg-[#f6f9fc]"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI
          </button>
        </div>
      </header>

      {findOpen && (
        <div className="shrink-0 border-b border-[#eef1f5] bg-[#fafbfc] px-3 py-2.5 sm:px-4">
          <div className="mx-auto flex max-w-[680px] items-start gap-2">
            <div className="min-w-0 flex-1">
              <FindPanel
                query={query}
                replacement={replacement}
                matchCount={matches.length}
                matchIndex={currentMatchIndex}
                findRef={findInputRef}
                onQueryChange={(value) => {
                  setQuery(value);
                  setMatchIndex(0);
                }}
                onReplacementChange={setReplacement}
                onPrev={() => goToMatch(currentMatchIndex - 1)}
                onNext={() =>
                  goToMatch(
                    document.activeElement === findInputRef.current
                      ? currentMatchIndex
                      : currentMatchIndex + 1
                  )
                }
                onReplace={replaceCurrent}
                onReplaceAll={replaceAll}
                onClose={() => setFindOpen(false)}
              />
            </div>
            <button
              type="button"
              aria-label="Close find"
              onClick={() => setFindOpen(false)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#697386] transition-colors hover:bg-white hover:text-[#0a2540]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {!canEdit && (
        <div className="shrink-0 border-b border-[#f0e0a8] bg-[#fffbeb] px-4 py-2 text-center text-[12.5px] text-[#9a6700]">
          This book is still being written. Editing unlocks when it finishes.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {!focusMode && (
          <aside className="hidden w-[264px] shrink-0 overflow-y-auto border-r border-[#eef1f5] bg-[#fafbfc] px-2 py-4 lg:block">
            <Outline
              chapters={book.chapters}
              titles={titles}
              wordCounts={wordCounts}
              activeSectionId={activeSectionId}
              onJump={jumpToSection}
            />
          </aside>
        )}

        <main
          ref={scrollRef}
          data-manuscript
          className="min-w-0 flex-1 overflow-y-auto"
        >
          <div className="mx-auto max-w-[700px] px-5 pb-48 pt-8 sm:px-10 sm:pb-40 sm:pt-14">
            {book.chapters.map((chapter) => (
              <section key={chapter.id} className="mb-16">
                <header className="mb-8">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#a3acb9]">
                    Chapter {chapter.number}
                  </p>
                  <h2
                    className={cn(
                      serifDisplay.className,
                      "mt-2 text-[30px] font-normal leading-[1.1] tracking-[-0.01em] text-[#0a2540] sm:text-[38px]"
                    )}
                  >
                    {chapter.title}
                  </h2>
                </header>

                {chapter.sections.map((section) => {
                  const hasSuggestion = suggestion?.sectionId === section.id;
                  return (
                    <article
                      key={section.id}
                      ref={(el) => {
                        blocksRef.current[section.id] = el;
                      }}
                      data-section-id={section.id}
                      className="mb-12 scroll-mt-6"
                    >
                      <input
                        value={titles[section.id] ?? ""}
                        onChange={(e) => updateTitle(section.id, e.target.value)}
                        onFocus={() => setActiveSectionId(section.id)}
                        readOnly={!canEdit}
                        aria-label="Section title"
                        placeholder={`Section ${section.number}`}
                        className="mb-3 w-full bg-transparent text-[12.5px] font-semibold uppercase tracking-[0.1em] text-[#697386] outline-none placeholder:text-[#c1c9d2] focus:text-[#0a2540]"
                      />
                      {editingSectionId === section.id && !hasSuggestion ? (
                        <ManuscriptTextarea
                          sectionId={section.id}
                          value={contents[section.id] ?? ""}
                          readOnly={!canEdit}
                          layoutKey={layoutKey}
                          className={cn(TEXT_SIZES[prefs.size], fontClass)}
                          onChange={updateContent}
                          onSelectRange={handleSelectRange}
                          onFocusSection={handleFocusSection}
                          onBlurSection={handleBlurSection}
                          onKeyDownSection={handleTextareaKeyDown}
                          registerRef={registerTextarea}
                        />
                      ) : (
                        <div data-rendered-section={section.id}>
                          <RenderedSection
                            sectionId={section.id}
                            value={contents[section.id] ?? ""}
                            title={titles[section.id] || `Section ${section.number}`}
                            canEdit={canEdit && !hasSuggestion}
                            className={cn(TEXT_SIZES[prefs.size], fontClass)}
                            onPointerUp={handleRenderedPointerUp}
                            onRequestEdit={handleRequestEdit}
                          />
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            ))}
          </div>
        </main>

        {aiOpen && !focusMode && (
          <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-[#eef1f5] bg-white lg:block">
            <AiPanel {...aiPanelProps} askRef={askRef} />
          </aside>
        )}
      </div>

      {/* Floating bar: Markdown formatting while editing, AI on a selection. */}
      {(selection || editingSectionId) && canEdit && !suggestion && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[84px] z-30 flex justify-center px-3 sm:bottom-6">
          <div className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-[#e6ebf1] bg-white p-1 shadow-[0_14px_36px_-12px_rgba(10,37,64,0.35)] [scrollbar-width:none]">
            {editingSectionId && (
              <>
                {(
                  [
                    { kind: "bold", label: "Bold", icon: Bold },
                    { kind: "italic", label: "Italic", icon: Italic },
                    { kind: "heading", label: "Heading", icon: Heading2 },
                    { kind: "list", label: "List", icon: List },
                    { kind: "quote", label: "Quote", icon: Quote },
                  ] as const
                ).map(({ kind, label, icon: Icon }) => (
                  <button
                    key={kind}
                    type="button"
                    aria-label={label}
                    title={label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFormat(kind)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#425466] transition-colors hover:bg-[#f6f9fc] hover:text-[#0a2540]"
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
                <span className="mx-1 h-5 w-px shrink-0 bg-[#e6ebf1]" />
              </>
            )}
            {selection ? (
              <>
                {selection.source === "rendered" && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      startEditing(selection.sectionId, selection.start)
                    }
                    className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium text-[#0a2540] transition-colors hover:bg-[#f6f9fc]"
                  >
                    Edit
                  </button>
                )}
                {SELECTION_ACTIONS.map((item) => (
                  <button
                    key={item.action}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => runAction(item.action)}
                    className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium text-[#0a2540] transition-colors hover:bg-[#f0efff] hover:text-[#635bff]"
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={openAsk}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#f0efff] px-3 py-1.5 text-[13px] font-medium text-[#635bff] transition-colors hover:bg-[#e4e1ff]"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Ask…
                </button>
              </>
            ) : (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const id = editingSectionId;
                  if (id) textareasRef.current[id]?.blur();
                  setEditingSectionId(null);
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#635bff] px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#5851e5]"
              >
                <Check className="h-3.5 w-3.5" />
                Done
              </button>
            )}
          </div>
        </div>
      )}

      {/* AI suggestion drawer: slides up from the bottom, text stays in place. */}
      {suggestion && (
        <div
          className={cn(
            "pointer-events-none fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-40 flex justify-center px-2 sm:bottom-0 sm:px-4",
            !focusMode && "lg:left-[264px]",
            !focusMode && aiOpen && "lg:right-[300px]"
          )}
        >
          <div
            role="dialog"
            aria-label="AI suggestion"
            className="pointer-events-auto w-full max-w-[720px] animate-in fade-in-0 slide-in-from-bottom-8 duration-300"
          >
            <SuggestionCard
              suggestion={suggestion}
              fontClass={fontClass}
              onAccept={acceptSuggestion}
              onRetry={retrySuggestion}
              onDiscard={discardSuggestion}
            />
          </div>
        </div>
      )}

      {/* Phone bottom bar */}
      <nav className="grid shrink-0 grid-cols-4 border-t border-[#eef1f5] bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        <BottomBarButton label="Contents" onClick={() => setSheet("contents")}>
          <BookOpen className="h-5 w-5" />
        </BottomBarButton>
        <BottomBarButton
          label="Find"
          active={findOpen}
          onClick={() => (findOpen ? setFindOpen(false) : openFind())}
        >
          <Search className="h-5 w-5" />
        </BottomBarButton>
        <BottomBarButton label="AI" accent onClick={() => setSheet("ai")}>
          <Sparkles className="h-5 w-5" />
        </BottomBarButton>
        <TextSettingsMenu
          size={prefs.size}
          font={prefs.font}
          onSize={(size) => setPrefs({ size })}
          onFont={(font) => setPrefs({ font })}
          trigger={
            <button
              type="button"
              className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-[#697386]"
            >
              <Type className="h-5 w-5" />
              Text
            </button>
          }
        />
      </nav>

      <Sheet open={sheet === "contents"} onOpenChange={(open) => !open && setSheet(null)}>
        <SheetContent side="bottom" className="max-h-[80dvh] gap-0 rounded-t-2xl">
          <SheetHeader className="pb-2">
            <SheetTitle>Contents</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto px-2 pb-6">
            <Outline
              chapters={book.chapters}
              titles={titles}
              wordCounts={wordCounts}
              activeSectionId={activeSectionId}
              onJump={jumpToSection}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === "ai"} onOpenChange={(open) => !open && setSheet(null)}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-2xl">
          <SheetHeader className="pb-0">
            <SheetTitle className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-[#635bff]" />
              Write with AI
            </SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto">
            <AiPanel {...aiPanelProps} askRef={askSheetRef} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SaveIndicator({
  status,
  onRetry,
}: {
  status: SaveStatus;
  onRetry: () => void;
}) {
  if (status === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-[#df1b41] hover:bg-[#fde8e8]"
      >
        <CloudOff className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Not saved · Retry</span>
      </button>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 px-2 text-[12px]",
        status === "saved" ? "text-[#0e6245]" : "text-[#697386]"
      )}
    >
      {status === "saving" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : status === "unsaved" ? (
        <span className="h-1.5 w-1.5 rounded-full bg-[#9a6700]" />
      ) : (
        <Check className="h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline">
        {status === "saving" ? "Saving…" : status === "unsaved" ? "Editing" : "Saved"}
      </span>
    </span>
  );
}

function HeaderButton({
  label,
  active,
  onClick,
  className,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
        active
          ? "bg-[#f0efff] text-[#635bff]"
          : "text-[#425466] hover:bg-[#f6f9fc] hover:text-[#0a2540]",
        className
      )}
    >
      {children}
    </button>
  );
}

function BottomBarButton({
  label,
  active,
  accent,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  accent?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
        accent || active ? "text-[#635bff]" : "text-[#697386]"
      )}
    >
      {children}
      {label}
    </button>
  );
}
