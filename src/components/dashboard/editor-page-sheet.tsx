"use client";

import { type RefObject } from "react";
import { cn } from "@/lib/utils";
import {
  A4_PAGE_STYLE,
  A4_TEXT_STYLE,
  contentAreaHeightPx,
  EDITOR_TYPOGRAPHY,
} from "@/lib/book-editor/a4";
import type { EditorPage } from "@/lib/book-editor/pages";

type EditorPageSheetProps = {
  page: EditorPage;
  pageNumber: number;
  showSectionHeader: boolean;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  readOnly?: boolean;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
};

export function EditorPageSheet({
  page,
  pageNumber,
  showSectionHeader,
  value,
  onChange,
  onFocus,
  readOnly = false,
  textareaRef,
}: EditorPageSheetProps) {
  const contentHeightPx = contentAreaHeightPx(showSectionHeader);

  return (
    <article
      id={`editor-page-${page.globalIndex}`}
      className="editor-a4-page relative flex shrink-0 flex-col bg-white shadow-[0_1px_3px_rgba(60,64,67,0.15),0_4px_8px_rgba(60,64,67,0.12)]"
      style={A4_PAGE_STYLE}
    >
      {showSectionHeader && (
        <header className="mb-4 shrink-0 border-b border-[#dadce0] pb-3">
          <p
            className="text-[#5f6368]"
            style={{
              ...A4_TEXT_STYLE,
              fontSize: "10pt",
              lineHeight: 1.4,
            }}
          >
            Chapter {page.chapterNumber} · {page.sectionTitle}
          </p>
          <h2
            className="mt-1 font-normal text-[#202124]"
            style={{
              ...A4_TEXT_STYLE,
              fontSize: "16pt",
              lineHeight: 1.3,
            }}
          >
            {page.chapterTitle}
          </h2>
        </header>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        readOnly={readOnly}
        spellCheck
        wrap="soft"
        className={cn(
          "block w-full flex-1 resize-none overflow-hidden border-0 bg-transparent p-0 text-justify text-[#202124] outline-none",
          "focus:ring-0"
        )}
        style={{
          ...A4_TEXT_STYLE,
          height: contentHeightPx,
          minHeight: contentHeightPx,
          maxHeight: contentHeightPx,
        }}
        placeholder={readOnly ? "" : "Type here…"}
      />

      <footer className="flex shrink-0 items-center justify-center py-2">
        <span
          className="text-[#9aa0a6]"
          style={{
            fontFamily: EDITOR_TYPOGRAPHY.fontFamily,
            fontSize: "10pt",
          }}
        >
          {pageNumber}
        </span>
      </footer>
    </article>
  );
}
