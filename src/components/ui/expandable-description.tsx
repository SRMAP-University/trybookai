"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function ExpandableDescription({
  text,
  className,
  previewChars = 160,
}: {
  text: string;
  className?: string;
  previewChars?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const trimmed = text.trim();
  const long =
    trimmed.length > previewChars || trimmed.split(/\n/).length > 3;
  const preview =
    long && !expanded
      ? `${trimmed.slice(0, previewChars).replace(/\s+\S*$/, "").trimEnd()}…`
      : trimmed;

  return (
    <div className={cn("max-w-2xl", className)}>
      <button
        type="button"
        onClick={() => {
          if (long) setExpanded((v) => !v);
        }}
        className={cn(
          "w-full text-left whitespace-pre-wrap",
          long && "cursor-pointer"
        )}
      >
        {preview}
      </button>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 block text-[13px] font-semibold text-[#635bff] hover:underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
