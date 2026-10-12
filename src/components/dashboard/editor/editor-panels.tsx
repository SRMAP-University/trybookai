"use client";

import { memo, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Play,
  RefreshCw,
  Replace,
  RotateCcw,
  Sparkles,
  Type,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatWords, readingTime } from "@/lib/reading-stats";
import { BookManuscript } from "@/components/book/book-manuscript";
import type { EditorAiAction } from "@/lib/book-editor/assist";

export type EditorSection = {
  id: string;
  number: number;
  title: string;
  content: string | null;
  pageCount: number;
};

export type EditorChapter = {
  id: string;
  number: number;
  title: string;
  summary: string | null;
  sections: EditorSection[];
};

export type TextSize = "sm" | "md" | "lg";
export type TextFont = "serif" | "sans";

export const TEXT_SIZES: Record<TextSize, string> = {
  sm: "text-[16px] leading-[1.75]",
  md: "text-[18px] leading-[1.8]",
  lg: "text-[20px] leading-[1.85]",
};

export const SELECTION_ACTIONS: { action: EditorAiAction; label: string }[] = [
  { action: "rewrite", label: "Rewrite" },
  { action: "expand", label: "Expand" },
  { action: "shorten", label: "Shorten" },
  { action: "fix_grammar", label: "Fix" },
];

export type Suggestion = {
  id: number;
  action: EditorAiAction;
  label: string;
  sectionId: string;
  baseContent: string;
  selectionStart?: number;
  selectionEnd?: number;
  instruction?: string;
  text: string;
  merged: string | null;
  status: "streaming" | "ready" | "error";
  error?: string;
};

/* -------------------------------------------------------------------------- */
/* Manuscript text area that grows with its content                           */
/* -------------------------------------------------------------------------- */

function autosize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export const ManuscriptTextarea = memo(function ManuscriptTextarea({
  sectionId,
  value,
  readOnly,
  className,
  layoutKey,
  onChange,
  onSelectRange,
  onFocusSection,
  onBlurSection,
  onKeyDownSection,
  registerRef,
}: {
  sectionId: string;
  value: string;
  readOnly: boolean;
  className: string;
  /** Changes when text size/font/viewport changes, to re-measure height. */
  layoutKey: string;
  onChange: (sectionId: string, value: string) => void;
  onSelectRange: (sectionId: string, start: number, end: number) => void;
  onFocusSection: (sectionId: string) => void;
  onBlurSection?: (sectionId: string) => void;
  onKeyDownSection?: (
    sectionId: string,
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => void;
  registerRef: (sectionId: string, el: HTMLTextAreaElement | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (ref.current) autosize(ref.current);
  }, [value, layoutKey]);

  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        registerRef(sectionId, el);
      }}
      value={value}
      readOnly={readOnly}
      spellCheck
      rows={3}
      onChange={(e) => onChange(sectionId, e.target.value)}
      onFocus={() => onFocusSection(sectionId)}
      onBlur={() => onBlurSection?.(sectionId)}
      onKeyDown={(e) => onKeyDownSection?.(sectionId, e)}
      onSelect={(e) =>
        onSelectRange(
          sectionId,
          e.currentTarget.selectionStart,
          e.currentTarget.selectionEnd
        )
      }
      placeholder={readOnly ? "" : "Start writing…"}
      className={cn(
        "block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[#1f2933] outline-none placeholder:text-[#a3acb9] selection:bg-[#635bff]/20",
        readOnly && "cursor-default",
        className
      )}
    />
  );
});

/* -------------------------------------------------------------------------- */
/* Formatted section: what the reader sees; click to edit                     */
/* -------------------------------------------------------------------------- */

export const RenderedSection = memo(function RenderedSection({
  sectionId,
  value,
  title,
  canEdit,
  className,
  onPointerUp,
  onRequestEdit,
}: {
  sectionId: string;
  value: string;
  title: string;
  canEdit: boolean;
  className: string;
  onPointerUp: (
    sectionId: string,
    container: HTMLElement,
    target: EventTarget | null
  ) => void;
  onRequestEdit: (sectionId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const empty = !value.trim();

  return (
    <div
      ref={ref}
      tabIndex={canEdit ? 0 : undefined}
      aria-label={canEdit ? `${title}. Press Enter to edit.` : undefined}
      onMouseUp={(e) => ref.current && onPointerUp(sectionId, ref.current, e.target)}
      onKeyDown={(e) => {
        if (canEdit && e.key === "Enter") {
          e.preventDefault();
          onRequestEdit(sectionId);
        }
      }}
      className={cn(
        // Touch screens pick whole paragraphs instead of native selection,
        // so the system copy/share menu never covers the AI actions.
        "rounded-lg outline-none transition-colors pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]",
        "[&_[data-picked]]:rounded-md [&_[data-picked]]:bg-[#f0efff] [&_[data-picked]]:shadow-[0_0_0_6px_#f0efff]",
        canEdit &&
          "-mx-3 cursor-text px-3 py-1 hover:bg-[#f8fafc] focus-visible:ring-2 focus-visible:ring-[#635bff]/30"
      )}
    >
      {empty ? (
        <p className={cn("text-[#a3acb9]", className)}>
          {canEdit ? "Start writing…" : "Not written yet."}
        </p>
      ) : (
        <BookManuscript
          content={value}
          className={cn("text-[#1f2933]", className)}
        />
      )}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Outline                                                                    */
/* -------------------------------------------------------------------------- */

export function Outline({
  chapters,
  titles,
  wordCounts,
  activeSectionId,
  onJump,
}: {
  chapters: EditorChapter[];
  titles: Record<string, string>;
  wordCounts: Record<string, number>;
  activeSectionId: string;
  onJump: (sectionId: string) => void;
}) {
  return (
    <nav className="space-y-4">
      {chapters.map((chapter) => {
        const chapterWords = chapter.sections.reduce(
          (sum, s) => sum + (wordCounts[s.id] ?? 0),
          0
        );
        const chapterActive = chapter.sections.some(
          (s) => s.id === activeSectionId
        );
        return (
          <div key={chapter.id}>
            <div className="flex items-baseline justify-between gap-2 px-2">
              <p
                className={cn(
                  "min-w-0 truncate text-[13px] font-medium",
                  chapterActive ? "text-[#0a2540]" : "text-[#425466]"
                )}
              >
                <span className="mr-1.5 font-mono text-[11px] text-[#a3acb9]">
                  {String(chapter.number).padStart(2, "0")}
                </span>
                {chapter.title}
              </p>
              <span className="shrink-0 text-[11px] tabular-nums text-[#a3acb9]">
                {formatWords(chapterWords)}
              </span>
            </div>
            <ul className="mt-1 space-y-0.5">
              {chapter.sections.map((section) => {
                const active = section.id === activeSectionId;
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => onJump(section.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg py-1.5 pl-8 pr-2 text-left text-[12.5px] transition-colors",
                        active
                          ? "bg-[#f0efff] font-medium text-[#635bff]"
                          : "text-[#697386] hover:bg-[#f6f9fc] hover:text-[#0a2540]"
                      )}
                    >
                      <span className="truncate">
                        {titles[section.id] || `Section ${section.number}`}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums opacity-70">
                        {formatWords(wordCounts[section.id] ?? 0)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* AI panel                                                                   */
/* -------------------------------------------------------------------------- */

export function AiPanel({
  canEdit,
  busy,
  selectionText,
  sectionWords,
  wordsPerPage,
  bookWords,
  askRef,
  onAction,
  onAsk,
}: {
  canEdit: boolean;
  busy: boolean;
  selectionText: string | null;
  sectionWords: number;
  wordsPerPage: number;
  bookWords: number;
  askRef?: React.RefObject<HTMLTextAreaElement | null>;
  onAction: (action: EditorAiAction) => void;
  onAsk: (instruction: string) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const disabled = !canEdit || busy;

  function submitAsk() {
    const text = instruction.trim();
    if (!text || disabled) return;
    onAsk(text);
    setInstruction("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-5 p-4">
        <div>
          <p className="text-[12px] font-medium text-[#697386]">Selection</p>
          {selectionText ? (
            <>
              <p className="mt-1.5 line-clamp-3 rounded-lg bg-[#f6f9fc] px-3 py-2 text-[12.5px] italic leading-relaxed text-[#425466]">
                “{selectionText}”
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {SELECTION_ACTIONS.map((item) => (
                  <button
                    key={item.action}
                    type="button"
                    disabled={disabled}
                    onClick={() => onAction(item.action)}
                    className="rounded-lg border border-[#e6ebf1] px-2 py-2 text-[12.5px] font-medium text-[#0a2540] transition-colors hover:border-[#c9c5ff] hover:bg-[#f8f7ff] hover:text-[#635bff] disabled:opacity-50"
                  >
                    {item.label === "Fix" ? "Fix grammar" : item.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#a3acb9]">
              Select text in the manuscript to rewrite, expand, shorten or fix it.
            </p>
          )}
        </div>

        <div>
          <p className="text-[12px] font-medium text-[#697386]">This section</p>
          <div className="mt-2 space-y-1.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAction("continue")}
              className="flex w-full items-center gap-2 rounded-lg border border-[#e6ebf1] px-3 py-2 text-left text-[12.5px] font-medium text-[#0a2540] transition-colors hover:border-[#c9c5ff] hover:bg-[#f8f7ff] disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5 text-[#635bff]" />
              Continue writing
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAction("regenerate_section")}
              className="flex w-full items-center gap-2 rounded-lg border border-[#e6ebf1] px-3 py-2 text-left text-[12.5px] font-medium text-[#0a2540] transition-colors hover:border-[#c9c5ff] hover:bg-[#f8f7ff] disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5 text-[#635bff]" />
              Regenerate section
            </button>
          </div>
        </div>

        <div>
          <p className="text-[12px] font-medium text-[#697386]">Ask for any change</p>
          <div className="mt-2 rounded-xl border border-[#e6ebf1] transition-[border-color,box-shadow] focus-within:border-[#c9c5ff] focus-within:ring-4 focus-within:ring-[#635bff]/10">
            <textarea
              ref={askRef}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value.slice(0, 500))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitAsk();
                }
              }}
              rows={3}
              disabled={disabled}
              placeholder={
                selectionText
                  ? "Make this darker, add dialogue…"
                  : "Make this section more suspenseful…"
              }
              className="block w-full resize-none bg-transparent px-3 pt-2.5 text-[16px] text-[#0a2540] outline-none placeholder:text-[#a3acb9] sm:text-[13px]"
            />
            <div className="flex items-center justify-between gap-2 px-2 pb-2">
              <span className="pl-1 text-[11px] text-[#a3acb9]">
                {selectionText ? "Applies to selection" : "Applies to section"}
              </span>
              <button
                type="button"
                disabled={disabled || !instruction.trim()}
                onClick={submitAsk}
                aria-label="Ask AI"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-[#635bff] text-white transition-colors hover:bg-[#5851e5] disabled:bg-[#e6ebf1] disabled:text-[#a3acb9]"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <p className="text-[11.5px] leading-relaxed text-[#a3acb9]">
          AI edits arrive as suggestions. Nothing changes until you accept, and
          you can undo after.
        </p>
      </div>

      <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-[#eef1f5] p-4 text-center">
        <div>
          <dt className="text-[11px] text-[#a3acb9]">Section</dt>
          <dd className="text-[13px] font-semibold tabular-nums text-[#0a2540]">
            {formatWords(sectionWords)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-[#a3acb9]">Pages</dt>
          <dd className="text-[13px] font-semibold tabular-nums text-[#0a2540]">
            ~{Math.max(1, Math.round(sectionWords / Math.max(1, wordsPerPage)))}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-[#a3acb9]">Book</dt>
          <dd className="text-[13px] font-semibold tabular-nums text-[#0a2540]">
            {formatWords(bookWords)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline AI suggestion                                                       */
/* -------------------------------------------------------------------------- */

export function SuggestionCard({
  suggestion,
  fontClass,
  onAccept,
  onRetry,
  onDiscard,
}: {
  suggestion: Suggestion;
  fontClass: string;
  onAccept: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const original =
    suggestion.selectionStart !== undefined &&
    suggestion.selectionEnd !== undefined &&
    suggestion.selectionStart !== suggestion.selectionEnd
      ? suggestion.baseContent.slice(
          suggestion.selectionStart,
          suggestion.selectionEnd
        )
      : null;
  const streaming = suggestion.status === "streaming";

  return (
    <div className="overflow-hidden rounded-2xl border border-[#c9c5ff] bg-white shadow-[0_-18px_48px_-20px_rgba(10,37,64,0.4)] sm:rounded-b-none sm:border-b-0">
      <div className="flex justify-center bg-[#f8f7ff] pt-2" aria-hidden>
        <span className="h-1 w-10 rounded-full bg-[#c9c5ff]" />
      </div>
      <div className="flex items-center justify-between gap-3 border-b border-[#eef1f5] bg-[#f8f7ff] px-4 pb-2.5 pt-1.5">
        <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-[#635bff]">
          {streaming ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">
            {suggestion.label}
            {streaming ? " · writing…" : ""}
          </span>
        </p>
        <button
          type="button"
          onClick={onDiscard}
          aria-label="Discard suggestion"
          className="rounded-md p-1 text-[#697386] transition-colors hover:bg-white hover:text-[#0a2540]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[38dvh] space-y-3 overflow-y-auto px-4 py-3">
        {original && (
          <p className="line-clamp-3 text-[13px] leading-relaxed text-[#a3acb9] line-through decoration-[#c1c9d2]">
            {original
              .replace(/^#{1,6}\s|^>\s|^[-*]\s/gm, "")
              .replace(/\*\*|__|[*_`]/g, "")
              .replace(/\|/g, " ")}
          </p>
        )}
        {suggestion.status === "error" ? (
          <p className="text-[13px] text-[#df1b41]">
            {suggestion.error ?? "The AI couldn’t finish. Try again."}
          </p>
        ) : (
          <div className={fontClass}>
            {suggestion.text.trim() ? (
              <BookManuscript
                content={suggestion.text}
                className="text-[16px] leading-[1.75] text-[#1f2933]"
              />
            ) : (
              <p className="text-[14px] text-[#a3acb9]">
                {streaming ? "Thinking…" : "No changes suggested."}
              </p>
            )}
            {streaming && (
              <span className="mt-1 inline-block h-4 w-[2px] animate-pulse bg-[#635bff]" />
            )}
          </div>
        )}
      </div>

      {!streaming && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[#eef1f5] px-4 py-2.5">
          {suggestion.status === "ready" && suggestion.merged !== null && (
            <button
              type="button"
              onClick={onAccept}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#635bff] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#5851e5]"
            >
              <Check className="h-3.5 w-3.5" />
              Accept
            </button>
          )}
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e6ebf1] px-3.5 text-[13px] font-medium text-[#0a2540] transition-colors hover:bg-[#f6f9fc]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try again
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="inline-flex h-8 items-center rounded-full px-3 text-[13px] font-medium text-[#697386] transition-colors hover:text-[#0a2540]"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Find and replace                                                           */
/* -------------------------------------------------------------------------- */

export function FindPanel({
  query,
  replacement,
  matchCount,
  matchIndex,
  findRef,
  onQueryChange,
  onReplacementChange,
  onPrev,
  onNext,
  onReplace,
  onReplaceAll,
  onClose,
}: {
  query: string;
  replacement: string;
  matchCount: number;
  matchIndex: number;
  findRef?: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void;
  onReplacementChange: (value: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose?: () => void;
}) {
  const hasMatches = matchCount > 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-lg border border-[#e6ebf1] bg-white focus-within:border-[#c9c5ff]">
          <input
            ref={findRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) onPrev();
                else onNext();
              }
              if (e.key === "Escape") onClose?.();
            }}
            placeholder="Find in book"
            aria-label="Find in book"
            className="h-9 min-w-0 flex-1 bg-transparent px-3 text-[16px] text-[#0a2540] outline-none placeholder:text-[#a3acb9] sm:text-[13px]"
          />
          <span className="shrink-0 px-2 text-[11.5px] tabular-nums text-[#a3acb9]">
            {query ? (hasMatches ? `${matchIndex + 1}/${matchCount}` : "0") : ""}
          </span>
        </div>
        <button
          type="button"
          aria-label="Previous match"
          disabled={!hasMatches}
          onClick={onPrev}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e6ebf1] text-[#425466] transition-colors hover:bg-[#f6f9fc] disabled:opacity-40"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Next match"
          disabled={!hasMatches}
          onClick={onNext}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e6ebf1] text-[#425466] transition-colors hover:bg-[#f6f9fc] disabled:opacity-40"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={replacement}
          onChange={(e) => onReplacementChange(e.target.value)}
          placeholder="Replace with"
          aria-label="Replace with"
          className="h-9 min-w-0 flex-1 rounded-lg border border-[#e6ebf1] bg-white px-3 text-[16px] text-[#0a2540] outline-none placeholder:text-[#a3acb9] focus:border-[#c9c5ff] sm:text-[13px]"
        />
        <button
          type="button"
          disabled={!hasMatches}
          onClick={onReplace}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#e6ebf1] px-3 text-[12.5px] font-medium text-[#0a2540] transition-colors hover:bg-[#f6f9fc] disabled:opacity-40"
        >
          <Replace className="h-3.5 w-3.5" />
          Replace
        </button>
        <button
          type="button"
          disabled={!hasMatches}
          onClick={onReplaceAll}
          className="inline-flex h-9 items-center rounded-lg border border-[#e6ebf1] px-3 text-[12.5px] font-medium text-[#0a2540] transition-colors hover:bg-[#f6f9fc] disabled:opacity-40"
        >
          All
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Text settings                                                              */
/* -------------------------------------------------------------------------- */

export function TextSettingsMenu({
  size,
  font,
  onSize,
  onFont,
  trigger,
}: {
  size: TextSize;
  font: TextFont;
  onSize: (size: TextSize) => void;
  onFont: (font: TextFont) => void;
  trigger?: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label="Text settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#425466] transition-colors hover:bg-[#f6f9fc] hover:text-[#0a2540]"
          >
            <Type className="h-4 w-4" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>Text size</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={size}
          onValueChange={(v) => onSize(v as TextSize)}
        >
          <DropdownMenuRadioItem value="sm">Small</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="md">Medium</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="lg">Large</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Font</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={font}
          onValueChange={(v) => onFont(v as TextFont)}
        >
          <DropdownMenuRadioItem value="serif">Serif</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="sans">Sans serif</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function readingSummary(words: number) {
  return `${formatWords(words)} words · ${readingTime(words)} read`;
}
