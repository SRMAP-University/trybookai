import { stripReasoning } from "@/lib/manuscript-clean";

/**
 * Turn manuscript markdown into text a narrator can read aloud: headings
 * become spoken titles, lists become sentences, tables are read row by row,
 * and figure markers and formatting symbols are dropped.
 */

function stripInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1$2")
    .replace(/(^|[^\w_])_(?!\s)([^_\n]+?)_(?!\w)/g, "$1$2")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** End a spoken line with a stop so the narrator pauses after it. */
function asSentence(text: string): string {
  const clean = stripInline(text);
  if (!clean) return "";
  return /[.!?…:;"”’)]$/.test(clean) ? clean : `${clean}.`;
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => stripInline(cell));
}

/** "| Element | Weak | Strong |" rows → "Outcome. Weak: …. Strong: …." */
function narrateTable(lines: string[]): string[] {
  const rows = lines
    .filter((line) => !/^\s*\|?\s*:?-{2,}/.test(line))
    .map(tableCells)
    .filter((cells) => cells.some(Boolean));
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  if (body.length === 0) return [asSentence(header.join(", "))];
  return body.map((cells) => {
    const [first, ...rest] = cells;
    const pairs = rest
      .map((cell, i) => (cell ? `${header[i + 1] || "Next"}: ${cell}` : ""))
      .filter(Boolean)
      .map(asSentence);
    return [asSentence(first), ...pairs].filter(Boolean).join(" ");
  });
}

export function markdownToNarration(markdown: string | null | undefined): string {
  const lines = stripReasoning(markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const paragraphs: string[] = [];
  let prose: string[] = [];
  let table: string[] = [];

  const flushProse = () => {
    const text = stripInline(prose.join(" "));
    if (text) paragraphs.push(text);
    prose = [];
  };
  const flushTable = () => {
    if (table.length) paragraphs.push(...narrateTable(table));
    table = [];
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (/^\|.*\|?$/.test(line) && line.includes("|", 1)) {
      flushProse();
      table.push(line);
      continue;
    }
    flushTable();

    if (!line) {
      flushProse();
      continue;
    }
    // Figures are for the page, scene breaks and rules are pauses.
    if (
      /^\[FIGURE:.*\]$/i.test(line) ||
      /^!\[[^\]]*\]\([^)]*\)$/.test(line) ||
      /^([-*_])(\s*\1){2,}$/.test(line)
    ) {
      flushProse();
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      flushProse();
      paragraphs.push(asSentence(heading[1]));
      continue;
    }
    const item = line.match(/^(?:[-*+]|\d+[.)])\s+(.+)$/);
    if (item) {
      flushProse();
      paragraphs.push(asSentence(item[1]));
      continue;
    }
    if (line.startsWith(">")) {
      prose.push(line.replace(/^>\s?/, ""));
      continue;
    }
    prose.push(line);
  }
  flushTable();
  flushProse();

  return paragraphs.filter(Boolean).join("\n\n");
}
