import type { ManuscriptLayout } from "@/lib/book-generator/core/format";

export * from "@/lib/book-generator/core/format";

export function layoutClassName(layout: ManuscriptLayout): string {
  switch (layout) {
    case "practical":
      return "font-sans tracking-[-0.01em]";
    case "academic":
      return "font-serif";
    case "youth":
      return "font-sans";
    default:
      return "font-serif";
  }
}
