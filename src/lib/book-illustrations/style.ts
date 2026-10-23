import { resolveManuscriptLayout, type ContentFormatInput } from "@/lib/book-generator/core/format";
import { reelStyle } from "@/lib/reel-generator/types";

/** Landscape pictures that sit across the reading column; multiples of 16 for Flux. */
export const ILLUSTRATION_SIZE = { width: 1216, height: 832 } as const;

const EDITORIAL_STYLE =
  "modern editorial illustration, clean confident shapes, soft grain texture, limited harmonious palette, uncluttered and conceptual";

/**
 * One art style per book, from its layout and genre: picture-book art for
 * children, editorial illustration for guides, painterly film stills for fiction.
 */
export function illustrationStyleFor(book: ContentFormatInput): { id: string; prompt: string } {
  const layout = resolveManuscriptLayout(book);
  const genre = (book.genre ?? "").toLowerCase();

  if (layout === "youth") return { id: "storybook", prompt: reelStyle("storybook").prompt };
  if (layout === "practical" || layout === "academic") {
    return { id: "editorial", prompt: EDITORIAL_STYLE };
  }
  if (/manga|anime|light novel/.test(genre)) return { id: "anime", prompt: reelStyle("anime").prompt };
  if (/comic|graphic|superhero/.test(genre)) {
    return { id: "graphic-novel", prompt: reelStyle("graphic-novel").prompt };
  }
  if (/romance|literary|memoir|poetry|women|cozy/.test(genre)) {
    return { id: "watercolor", prompt: reelStyle("watercolor").prompt };
  }
  return { id: "cinematic", prompt: reelStyle("cinematic").prompt };
}
