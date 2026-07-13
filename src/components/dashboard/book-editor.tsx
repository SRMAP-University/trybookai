"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type SaveStatus } from "@/lib/book-editor/utils";
import {
  buildEditorPages,
  findFirstPageIndex,
  mergePages,
  splitContentIntoPages,
  type EditorPage,
} from "@/lib/book-editor/pages";
import { estimateWordsPerVisualPage } from "@/lib/book-editor/a4";
import { EditorPageSheet } from "@/components/dashboard/editor-page-sheet";
import { toast } from "sonner";

type Section = {
  id: string;
  number: number;
  title: string;
  content: string | null;
  pageCount: number;
};

type Chapter = {
  id: string;
  number: number;
  title: string;
  summary: string | null;
  sections: Section[];
};

type Book = {
  id: string;
  title: string;
  status: string;
  wordsPerPage: number;
  chapters: Chapter[];
};

type EditorAiAction =
  | "rewrite"
  | "expand"
  | "shorten"
  | "continue"
  | "fix_grammar"
  | "regenerate_section";

const AI_ACTIONS: {
  action: EditorAiAction;
  label: string;
  description: string;
  needsSelection: boolean;
}[] = [
  {
    action: "rewrite",
    label: "Rewrite",
    description: "Improve clarity and flow",
    needsSelection: true,
  },
  {
    action: "expand",
    label: "Expand",
    description: "Add detail and depth",
    needsSelection: true,
  },
  {
    action: "shorten",
    label: "Shorten",
    description: "Make more concise",
    needsSelection: true,
  },
  {
    action: "fix_grammar",
    label: "Fix grammar",
    description: "Polish grammar and style",
    needsSelection: true,
  },
  {
    action: "continue",
    label: "Continue writing",
    description: "AI writes the next paragraphs",
    needsSelection: false,
  },
  {
    action: "regenerate_section",
    label: "Regenerate section",
    description: "Rewrite this entire section",
    needsSelection: false,
  },
];

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
      /* skip */
    }
  }
  return { events, rest };
}

function initialSectionContents(book: Book): Record<string, string> {
  const map: Record<string, string> = {};
  for (const chapter of book.chapters) {
    for (const section of chapter.sections) {
      map[section.id] = section.content ?? "";
    }
  }
  return map;
}

function selectionOffsetInSection(
  pages: EditorPage[],
  sectionId: string,
  pageInSection: number,
  localStart: number
): number {
  const sectionPages = pages
    .filter((p) => p.sectionId === sectionId)
    .sort((a, b) => a.pageInSection - b.pageInSection);

  let offset = 0;
  for (const page of sectionPages) {
    if (page.pageInSection === pageInSection) {
      return offset + localStart;
    }
    if (page.content.length > 0) {
      offset += page.content.length + 2;
    }
  }
  return localStart;
}

function isFirstPageOfSection(page: EditorPage, pages: EditorPage[]): boolean {
  const sectionPages = pages.filter((p) => p.sectionId === page.sectionId);
  return page.pageInSection === 0 && sectionPages.length > 0;
}

type BookEditorProps = {
  book: Book;
};

export function BookEditor({ book: initialBook }: BookEditorProps) {
  const [book, setBook] = useState(initialBook);
  const [sectionContents, setSectionContents] = useState(() =>
    initialSectionContents(initialBook)
  );
  const [focusedPageIndex, setFocusedPageIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [aiOpen, setAiOpen] = useState(true);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const focusedTextareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<Record<string, string>>(
    initialSectionContents(initialBook)
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageOverridesRef = useRef<Record<number, string>>({});
  const [overrideTick, setOverrideTick] = useState(0);

  const editorWordsPerPage = useMemo(
    () => Math.max(book.wordsPerPage, estimateWordsPerVisualPage(false)),
    [book.wordsPerPage]
  );

  const pages = useMemo(
    () => buildEditorPages(book, sectionContents, editorWordsPerPage),
    [book, sectionContents, editorWordsPerPage]
  );

  const displayPages = useMemo(
    () =>
      pages.map((p) => ({
        ...p,
        content: pageOverridesRef.current[p.globalIndex] ?? p.content,
      })),
    [pages, overrideTick]
  );

  const focusedPage = displayPages[focusedPageIndex] ?? displayPages[0];
  const totalPages = displayPages.length;

  const saveSection = useCallback(
    async (sectionId: string, text: string) => {
      setSaveStatus("saving");
      const res = await fetch(
        `/api/books/${book.id}/sections/${sectionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveStatus("error");
        toast.error((data as { error?: string }).error ?? "Save failed");
        return;
      }
      lastSavedRef.current[sectionId] = text;
      setSaveStatus("saved");
      setBook((prev) => ({
        ...prev,
        chapters: prev.chapters.map((ch) => ({
          ...ch,
          sections: ch.sections.map((s) =>
            s.id === sectionId ? { ...s, content: text } : s
          ),
        })),
      }));
    },
    [book.id]
  );

  const persistSection = useCallback(
    (sectionId: string, text: string) => {
      setSectionContents((prev) => ({ ...prev, [sectionId]: text }));
      setSaveStatus("unsaved");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void saveSection(sectionId, text);
      }, 900);
    },
    [saveSection]
  );

  const getSectionText = useCallback(
    (sectionId: string) => {
      const texts = displayPages
        .filter((p) => p.sectionId === sectionId)
        .sort((a, b) => a.pageInSection - b.pageInSection)
        .map((p) => p.content);
      return mergePages(texts);
    },
    [displayPages]
  );

  const flushPageEdits = useCallback(() => {
    const sectionIds = [...new Set(pages.map((p) => p.sectionId))];
    const nextContents = { ...sectionContents };

    for (const sectionId of sectionIds) {
      if (!sectionId) continue;
      const sectionPageTexts = pages
        .filter((p) => p.sectionId === sectionId)
        .sort((a, b) => a.pageInSection - b.pageInSection)
        .map(
          (p) => pageOverridesRef.current[p.globalIndex] ?? p.content
        );

      const combined = sectionPageTexts.join("\n\n");
      const resplit = splitContentIntoPages(combined, editorWordsPerPage);
      nextContents[sectionId] = mergePages(resplit);
    }

    pageOverridesRef.current = {};
    setOverrideTick((t) => t + 1);
    setSectionContents(nextContents);

    for (const sectionId of sectionIds) {
      if (!sectionId) continue;
      const text = nextContents[sectionId];
      if (text !== lastSavedRef.current[sectionId]) {
        void saveSection(sectionId, text);
      }
    }
  }, [pages, sectionContents, editorWordsPerPage, saveSection]);

  const updatePageContent = useCallback(
    (globalIndex: number, text: string) => {
      pageOverridesRef.current[globalIndex] = text;
      setOverrideTick((t) => t + 1);
      setSaveStatus("unsaved");

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        flushPageEdits();
      }, 900);
    },
    [flushPageEdits]
  );

  function scrollToPage(globalIndex: number) {
    setFocusedPageIndex(globalIndex);
    const el = document.getElementById(`editor-page-${globalIndex}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function switchSection(sectionId: string) {
    const index = findFirstPageIndex(pages, sectionId);
    scrollToPage(index);
  }

  async function runAiAction(action: EditorAiAction) {
    if (!focusedPage?.sectionId || aiRunning) return;

    const textarea = focusedTextareaRef.current;
    const localStart = textarea?.selectionStart ?? 0;
    const localEnd = textarea?.selectionEnd ?? 0;
    const sectionText = getSectionText(focusedPage.sectionId);
    const selectionStart = selectionOffsetInSection(
      displayPages,
      focusedPage.sectionId,
      focusedPage.pageInSection,
      localStart
    );
    const selectionEnd = selectionOffsetInSection(
      displayPages,
      focusedPage.sectionId,
      focusedPage.pageInSection,
      localEnd
    );
    const selection = sectionText.slice(selectionStart, selectionEnd);

    const actionMeta = AI_ACTIONS.find((a) => a.action === action);
    if (actionMeta?.needsSelection && !selection.trim()) {
      toast.error("Select text on this page first");
      return;
    }

    setAiRunning(true);
    setAiMessage("Starting…");

    try {
      const res = await fetch(`/api/books/${book.id}/ai/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          sectionId: focusedPage.sectionId,
          content: sectionText,
          selection: selection || undefined,
          selectionStart,
          selectionEnd,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "AI failed");
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
          if (evt.type === "phase") {
            setAiMessage((evt.data.message as string) ?? "Working…");
          }
          if (evt.type === "done") {
            const merged = evt.data.content as string;
            const sectionId = focusedPage.sectionId;
            const pageInSection = focusedPage.pageInSection;
            const updatedContents = {
              ...sectionContents,
              [sectionId]: merged,
            };
            setSectionContents(updatedContents);
            persistSection(sectionId, merged);

            const newPages = buildEditorPages(book, updatedContents);
            const newGlobalIndex = newPages.findIndex(
              (p) =>
                p.sectionId === sectionId && p.pageInSection === pageInSection
            );
            if (newGlobalIndex >= 0) {
              setFocusedPageIndex(newGlobalIndex);
              requestAnimationFrame(() => scrollToPage(newGlobalIndex));
            }
            toast.success("AI edit applied");
          }
          if (evt.type === "error") {
            throw new Error((evt.data.message as string) ?? "AI failed");
          }
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI failed");
    } finally {
      setAiRunning(false);
      setAiMessage(null);
    }
  }

  const canEdit =
    book.status !== "GENERATING" && book.status !== "OUTLINING";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f0f0f0]">
      <header className="z-10 flex shrink-0 items-center justify-between gap-3 border-b border-[#dadce0] bg-white px-4 py-2.5 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 shrink-0 text-[#5f6368]" asChild>
            <Link href={`/dashboard/books/${book.id}`}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Book
            </Link>
          </Button>
          <div className="hidden h-4 w-px bg-[#dadce0] sm:block" />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-[#202124]">
              {book.title}
            </p>
            {focusedPage && (
              <p className="truncate text-[12px] text-[#5f6368]">
                Page {focusedPageIndex + 1} of {totalPages} · Ch.{" "}
                {focusedPage.chapterNumber}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden text-[12px] text-[#5f6368] lg:inline">
            A4 · 12pt · ~{editorWordsPerPage} words/page
          </span>
          <span
            className={cn(
              "flex items-center gap-1 text-[12px]",
              saveStatus === "saved" && "text-[#0e6245]",
              saveStatus === "saving" && "text-[#635bff]",
              saveStatus === "unsaved" && "text-[#9a6700]",
              saveStatus === "error" && "text-[#df1b41]"
            )}
          >
            {saveStatus === "saving" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : saveStatus === "saved" ? (
              <Check className="h-3 w-3" />
            ) : null}
            <span className="hidden sm:inline">
              {saveStatus === "saved"
                ? "Saved"
                : saveStatus === "saving"
                  ? "Saving…"
                  : saveStatus === "unsaved"
                    ? "Unsaved"
                    : "Error"}
            </span>
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-[#dadce0]"
            onClick={() => setAiOpen((v) => !v)}
          >
            {aiOpen ? (
              <PanelRightClose className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <PanelRightOpen className="mr-1.5 h-3.5 w-3.5" />
            )}
            AI
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[220px] shrink-0 flex-col border-r border-[#dadce0] bg-white md:flex">
          <div className="border-b border-[#dadce0] px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#5f6368]">
              Outline
            </p>
          </div>
          <nav className="flex-1 overflow-y-auto p-2">
            {book.chapters.map((chapter) => (
              <div key={chapter.id} className="mb-3">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#80868b]">
                  Ch. {chapter.number}
                </p>
                <p className="px-2 text-[12px] font-medium text-[#202124]">
                  {chapter.title}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {chapter.sections.map((section) => {
                    const sectionPageList = pages.filter(
                      (p) => p.sectionId === section.id
                    );
                    const isActive = focusedPage?.sectionId === section.id;
                    return (
                      <li key={section.id}>
                        <button
                          type="button"
                          onClick={() => switchSection(section.id)}
                          className={cn(
                            "flex w-full items-center justify-between gap-1 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors",
                            isActive
                              ? "bg-[#e8f0fe] font-medium text-[#1967d2]"
                              : "text-[#3c4043] hover:bg-[#f1f3f4]"
                          )}
                        >
                          <span className="truncate">{section.title}</span>
                          <span className="shrink-0 text-[10px] text-[#9aa0a6]">
                            {sectionPageList.length}p
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main
          ref={scrollRef}
          className="min-w-0 flex-1 overflow-y-auto overflow-x-auto bg-[#e8eaed]"
        >
          {!canEdit && (
            <div className="sticky top-0 z-10 border-b border-[#fce8b2] bg-[#fef7e0] px-4 py-2 text-center text-[12px] text-[#b06000]">
              Generation in progress — editor unlocks when complete
            </div>
          )}

          <div className="shrink-0 border-b border-[#dadce0] bg-white px-3 py-2 md:hidden">
            <select
              value={focusedPage?.sectionId ?? ""}
              onChange={(e) => switchSection(e.target.value)}
              className="w-full rounded-md border border-[#dadce0] bg-[#f8f9fa] px-3 py-2 text-[13px] text-[#202124]"
            >
              {book.chapters.map((chapter) =>
                chapter.sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    Ch.{chapter.number} · {section.title}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Stacked A4 pages — scroll the document, not inside each page */}
          <div className="flex min-h-full flex-col items-center gap-10 py-10">
            {pages.map((page, index) => {
              const display = displayPages[index] ?? page;
              return (
              <EditorPageSheet
                key={`${page.sectionId}-${page.pageInSection}`}
                page={display}
                pageNumber={index + 1}
                showSectionHeader={isFirstPageOfSection(page, pages)}
                value={display.content}
                onChange={(text) => updatePageContent(page.globalIndex, text)}
                onFocus={() => setFocusedPageIndex(page.globalIndex)}
                readOnly={!canEdit || aiRunning}
                textareaRef={
                  focusedPageIndex === page.globalIndex
                    ? focusedTextareaRef
                    : undefined
                }
              />
            );
            })}
          </div>
        </main>

        {aiOpen && (
          <aside className="flex w-[260px] shrink-0 flex-col border-l border-[#dadce0] bg-white lg:w-[280px]">
            <div className="border-b border-[#dadce0] px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#635bff]" />
                <p className="text-[13px] font-medium text-[#202124]">
                  AI writing tools
                </p>
              </div>
              <p className="mt-1 text-[12px] text-[#5f6368]">
                Select text on a page, then pick an action.
              </p>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {AI_ACTIONS.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  disabled={!canEdit || aiRunning}
                  onClick={() => runAiAction(item.action)}
                  className="flex w-full flex-col rounded-lg border border-[#dadce0] px-3 py-2.5 text-left transition-colors hover:border-[#635bff]/40 hover:bg-[#f8f9fa] disabled:opacity-50"
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#202124]">
                    <Wand2 className="h-3.5 w-3.5 text-[#635bff]" />
                    {item.label}
                  </span>
                  <span className="mt-0.5 text-[11px] text-[#5f6368]">
                    {item.description}
                  </span>
                </button>
              ))}
            </div>

            {aiRunning && (
              <div className="border-t border-[#dadce0] px-4 py-3">
                <div className="flex items-center gap-2 text-[12px] text-[#635bff]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {aiMessage ?? "AI is writing…"}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
