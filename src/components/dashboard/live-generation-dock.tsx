"use client";

import { type RefObject } from "react";
import {
  ChevronLeft,
  Loader2,
  Minus,
  PenLine,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type LiveSectionInfo = {
  sectionId: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  sectionNumber: number;
  sectionTitle: string;
};

type LiveGenerationDockProps = {
  open: boolean;
  minimized: boolean;
  onMinimize: () => void;
  onExpand: () => void;
  phaseMessage: string | null;
  liveSection: LiveSectionInfo | null;
  liveContent: string;
  progress: number;
  currentPages: number;
  targetPages: number;
  bookTitle: string;
  contentRef: RefObject<HTMLDivElement | null>;
};

function PaperContent({
  bookTitle,
  liveSection,
  liveContent,
  phaseMessage,
  contentRef,
}: {
  bookTitle: string;
  liveSection: LiveSectionInfo | null;
  liveContent: string;
  phaseMessage: string | null;
  contentRef: RefObject<HTMLDivElement | null>;
}) {
  const paragraphs = liveContent
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const isOutlining = phaseMessage === "Building outline…";

  return (
    <div
      ref={contentRef}
      className="flex-1 overflow-y-auto bg-[#e8e6e1] px-3 py-4"
    >
      <article
        className="mx-auto min-h-full max-w-none rounded-sm bg-[#fffef8] px-6 py-8 shadow-[0_1px_3px_rgba(10,37,64,0.08),0_8px_24px_rgba(10,37,64,0.06)]"
        style={{
          backgroundImage:
            "linear-gradient(#f5f3ee 1px, transparent 1px)",
          backgroundSize: "100% 28px",
          backgroundPosition: "0 32px",
        }}
      >
        <header className="border-b border-[#e6e0d4] pb-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#a39e94]">
            Manuscript
          </p>
          <h1 className="mt-2 font-serif text-[18px] font-semibold leading-snug tracking-[-0.02em] text-[#1a1a1a]">
            {bookTitle}
          </h1>
          {liveSection ? (
            <div className="mt-4 space-y-1">
              <p className="font-serif text-[13px] font-medium text-[#3d3d3d]">
                Chapter {liveSection.chapterNumber}: {liveSection.chapterTitle}
              </p>
              <p className="font-serif text-[12px] italic text-[#6b6560]">
                {liveSection.sectionTitle}
              </p>
            </div>
          ) : isOutlining ? (
            <p className="mt-4 font-serif text-[12px] italic text-[#6b6560]">
              Preparing outline…
            </p>
          ) : null}
        </header>

        <div className="mt-6 font-serif text-[15px] leading-[1.9] text-[#2c2c2c]">
          {paragraphs.length > 0 ? (
            paragraphs.map((paragraph, i) => (
              <p
                key={i}
                className={cn(
                  "mb-5 text-justify",
                  i === 0 && "first-letter:float-left first-letter:mr-1 first-letter:text-[2.4em] first-letter:font-semibold first-letter:leading-none first-letter:text-[#1a1a1a]"
                )}
              >
                {paragraph}
              </p>
            ))
          ) : (
            <div className="flex min-h-[200px] flex-col items-center justify-center py-12 text-center">
              <Loader2 className="mb-3 h-5 w-5 animate-spin text-[#a39e94]" />
              <p className="font-serif text-[14px] italic text-[#8a847a]">
                {phaseMessage === "Composing draft…" ||
                phaseMessage?.includes("Composing")
                  ? "Composing the draft…"
                  : isOutlining
                    ? "Structuring chapters on the page…"
                    : liveSection
                      ? "Words will appear here shortly…"
                      : "The first words will appear here…"}
              </p>
            </div>
          )}
          {liveContent && (
            <span className="ml-0.5 inline-block h-[18px] w-[2px] animate-pulse bg-[#635bff]" />
          )}
        </div>
      </article>
    </div>
  );
}

export function LiveGenerationDock({
  open,
  minimized,
  onMinimize,
  onExpand,
  phaseMessage,
  liveSection,
  liveContent,
  progress,
  currentPages,
  targetPages,
  bookTitle,
  contentRef,
}: LiveGenerationDockProps) {
  if (!open) return null;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={onExpand}
        className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-lg border border-r-0 border-[#635bff]/30 bg-[#0a2540] px-2.5 py-4 text-white shadow-lg transition-transform hover:px-3"
        aria-label="Expand live generation"
      >
        <PenLine className="h-4 w-4 text-[#c4bfff]" />
        <Loader2 className="h-4 w-4 animate-spin text-[#635bff]" />
        <span
          className="text-[10px] font-medium uppercase tracking-wider text-white/80"
          style={{ writingMode: "vertical-rl" }}
        >
          Writing
        </span>
        <span className="rounded bg-[#635bff] px-1.5 py-0.5 text-[10px] font-semibold">
          {Math.round(progress)}%
        </span>
      </button>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-[#0a2540]/10 lg:bg-transparent"
        aria-hidden
      />
      <aside
        className={cn(
          "fixed right-0 top-14 z-40 flex w-[min(100vw,420px)] flex-col border-l border-[#e6ebf1] bg-[#f6f9fc] shadow-[-12px_0_40px_rgba(10,37,64,0.12)]",
          "bottom-16 lg:top-16 lg:bottom-0"
        )}
      >
        <div className="flex items-center gap-2 border-b border-[#e6ebf1] bg-white px-4 py-3">
          <PenLine className="h-4 w-4 shrink-0 text-[#635bff]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-[#0a2540]">
              Live generation
            </p>
            <p className="truncate text-[11px] text-[#697386]">{bookTitle}</p>
          </div>
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#635bff]" />
          <button
            type="button"
            onClick={onMinimize}
            className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#697386] transition-colors hover:bg-[#f6f9fc] hover:text-[#0a2540]"
            aria-label="Minimize dock"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-[#e6ebf1] bg-white px-4 py-2.5">
          <p className="text-[11px] font-medium text-[#635bff]">
            {phaseMessage ?? "Writing your book…"}
          </p>
          <div className="mt-2">
            <div className="mb-1 flex justify-between text-[10px] text-[#697386]">
              <span>
                {currentPages} pages written
                {targetPages > 0 ? ` · target ${targetPages}` : ""}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-1" />
          </div>
        </div>

        <PaperContent
          bookTitle={bookTitle}
          liveSection={liveSection}
          liveContent={liveContent}
          phaseMessage={phaseMessage}
          contentRef={contentRef}
        />

        <div className="border-t border-[#e6ebf1] bg-white px-4 py-2">
          <button
            type="button"
            onClick={onMinimize}
            className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium text-[#697386] transition-colors hover:bg-[#f6f9fc] hover:text-[#0a2540]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Minimize
          </button>
        </div>
      </aside>
    </>
  );
}
