/**
 * Where pictures go in a section's markdown. The planner numbers prose
 * paragraphs with these same helpers, so a planned "paragraph 3" is the third
 * prose block here. Figures are not prose, so inserting one never shifts the
 * numbering of the paragraphs after it.
 */

const NON_PROSE = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>|\[FIGURE:|!\[|```|(-{3,}|\*{3,}|_{3,})\s*$)/i;

/** Blocks separated by blank lines, keeping fenced code blocks whole. */
export function splitBlocks(content: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fenced = false;
  for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
    if (line.trim().startsWith("```")) fenced = !fenced;
    if (!fenced && !line.trim()) {
      if (current.length) blocks.push(current.join("\n").trim());
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length) blocks.push(current.join("\n").trim());
  return blocks.filter(Boolean);
}

export function isProse(block: string): boolean {
  return !NON_PROSE.test(block.trim());
}

export function proseParagraphs(content: string | null | undefined): string[] {
  return splitBlocks(content ?? "").filter(isProse);
}

export function figureLine(caption: string, url: string): string {
  const alt =
    caption
      .replace(/[[\]\r\n]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160) || "Illustration";
  return `![${alt}](${url})`;
}

/** Insert a figure after a prose paragraph (clamped to the section's last one). */
export function insertFigureAfterParagraph(
  content: string,
  paragraphIndex: number,
  line: string
): string {
  const blocks = splitBlocks(content);
  if (!blocks.length) return line;
  const proseCount = blocks.filter(isProse).length;
  const target = Math.min(Math.max(paragraphIndex, 0), Math.max(proseCount - 1, 0));
  let at = blocks.length - 1;
  let seen = -1;
  for (let i = 0; i < blocks.length; i += 1) {
    if (!isProse(blocks[i])) continue;
    seen += 1;
    if (seen === target) {
      at = i;
      break;
    }
  }
  // Never stack two pictures directly on top of each other.
  while (at + 1 < blocks.length && blocks[at + 1].startsWith("![")) at += 1;
  blocks.splice(at + 1, 0, line);
  return blocks.join("\n\n");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Picture file names start with the illustration id, so a new version can replace the old one. */
export function replaceFigureUrl(
  content: string,
  illustrationId: string,
  url: string,
  caption?: string
): string {
  const re = new RegExp(`!\\[([^\\]]*)\\]\\(([^)]*/${escapeRegExp(illustrationId)}-[^)]*)\\)`, "g");
  return content.replace(re, (_match, alt: string) => figureLine(caption ?? alt, url));
}

/** Remove every picture line, e.g. before handing text to a writer or narrator. */
export function stripFigureLines(content: string): string {
  return content
    .replace(/^[ \t]*!\[[^\]]*\]\([^)]*\)[ \t]*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
