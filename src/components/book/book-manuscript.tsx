import type { ReactNode } from "react";
import { ImageIcon } from "lucide-react";
import { parseManuscriptBlocks } from "@/lib/book-content-blocks";
import {
  layoutClassName,
  resolveManuscriptLayout,
  type ContentFormatInput,
  type ManuscriptLayout,
} from "@/lib/book-generator/content-format";
import { cn } from "@/lib/utils";

type BookManuscriptProps = {
  content: string;
  genre?: string | null;
  templateId?: string | null;
  compact?: boolean;
  className?: string;
};

function inlineMarkdown(text: string) {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={key++} className="font-semibold text-inherit">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*")) {
      parts.push(
        <em key={key++} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else {
      parts.push(
        <code
          key={key++}
          className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.9em]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function headingClass(
  level: 1 | 2 | 3 | 4,
  layout: ManuscriptLayout,
  compact: boolean
) {
  const base =
    layout === "literary"
      ? "font-serif italic tracking-[-0.02em]"
      : layout === "youth"
        ? "font-sans font-semibold tracking-[-0.02em]"
        : layout === "academic"
          ? "font-serif font-semibold tracking-[-0.02em]"
          : "font-sans font-semibold tracking-[-0.02em]";

  if (compact) {
    if (level <= 2) return cn(base, "text-[14px] text-[#0a2540]");
    if (level === 3) return cn(base, "text-[13px] text-[#0a2540]");
    return cn(base, "text-[12px] text-[#425466]");
  }
  if (level <= 2) return cn(base, "text-[20px] text-[#0a2540]");
  if (level === 3) return cn(base, "text-[16px] text-[#0a2540]");
  return cn(base, "text-[14px] text-[#425466]");
}

export function BookManuscript({
  content,
  genre,
  templateId,
  compact = false,
  className,
}: BookManuscriptProps) {
  const layout = resolveManuscriptLayout({ genre, templateId } satisfies ContentFormatInput);
  const blocks = parseManuscriptBlocks(content || "");
  const body =
    layout === "youth"
      ? compact
        ? "text-[13px] leading-relaxed"
        : "text-[16px] leading-[1.8]"
      : compact
        ? "text-[13px] leading-relaxed"
        : layout === "practical"
          ? "text-[15px] leading-[1.7]"
          : "text-[15px] leading-[1.8]";

  if (!blocks.length) {
    return (
      <p className={cn(layoutClassName(layout), body, "text-[#697386]", className)}>
        Not generated yet.
      </p>
    );
  }

  return (
    <div
      className={cn(
        layoutClassName(layout),
        body,
        "space-y-3 text-[#425466] sm:space-y-4",
        className
      )}
    >
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const className = cn(
            headingClass(block.level, layout, compact),
            index === 0 ? "mt-0" : compact ? "mt-4" : "mt-6"
          );
          const children = inlineMarkdown(block.text);
          if (block.level <= 2) {
            return (
              <h2 key={index} className={className}>
                {children}
              </h2>
            );
          }
          if (block.level === 3) {
            return (
              <h3 key={index} className={className}>
                {children}
              </h3>
            );
          }
          return (
            <h4 key={index} className={className}>
              {children}
            </h4>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote
              key={index}
              className="border-l-2 border-[#d8dee8] pl-3 italic text-[#697386]"
            >
              {inlineMarkdown(block.text)}
            </blockquote>
          );
        }

        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              key={index}
              className={cn(
                "space-y-1 pl-5",
                block.ordered ? "list-decimal" : "list-disc"
              )}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{inlineMarkdown(item)}</li>
              ))}
            </List>
          );
        }

        if (block.type === "table") {
          return (
            <div
              key={index}
              className="overflow-x-auto rounded-lg border border-[#e6ebf1] bg-white"
            >
              <table className="w-full min-w-[280px] border-collapse text-left">
                <thead className="bg-[#f6f9fc]">
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th
                        key={headerIndex}
                        className="border-b border-[#e6ebf1] px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-[#0a2540]"
                      >
                        {inlineMarkdown(header)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="align-top">
                      {row.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          className="border-t border-[#eef1f5] px-3 py-2 text-[13px] text-[#425466]"
                        >
                          {inlineMarkdown(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === "figure") {
          if (block.src) {
            return (
              <figure
                key={index}
                className="overflow-hidden rounded-xl border border-[#e6ebf1] bg-[#f6f9fc]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={block.src}
                  alt={block.caption}
                  className="max-h-72 w-full object-cover"
                />
                <figcaption className="px-3 py-2 text-[12px] text-[#697386]">
                  {block.caption}
                </figcaption>
              </figure>
            );
          }
          return (
            <figure
              key={index}
              className="rounded-xl border border-dashed border-[#d8dee8] bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] px-4 py-5"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#635bff] shadow-sm">
                  <ImageIcon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#697386]">
                    Illustration
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[#0a2540]">
                    {block.caption}
                  </p>
                </div>
              </div>
            </figure>
          );
        }

        if (block.type === "rule") {
          return (
            <hr key={index} className="border-0 border-t border-[#e6ebf1]" />
          );
        }

        return <p key={index}>{inlineMarkdown(block.text)}</p>;
      })}
    </div>
  );
}
