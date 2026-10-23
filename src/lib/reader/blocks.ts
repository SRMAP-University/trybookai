import { escapeHtml, parseManuscriptBlocks, tokenizeInline } from "@/lib/book-content-blocks";

/** What the reader needs from a chapter. */
export type ReaderChapter = {
  number: number;
  title: string;
  imageUrl: string | null;
  sections: { title: string; content: string | null }[];
};

/** One word with its inline style; `sp` when a space follows it. */
export type Word = { t: string; b?: boolean; i?: boolean; c?: boolean; sp: boolean };

/** A unit the paginator places on pages. Paragraphs and lists can split across pages. */
export type ReaderBlock =
  | { kind: "p"; words: Word[]; dropCap?: boolean; noIndent?: boolean; quote?: boolean }
  | { kind: "h"; level: 3 | 4; text: string }
  | { kind: "list"; ordered: boolean; items: Word[][] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "figure"; src: string; caption: string }
  | { kind: "break" };

function toWords(text: string): Word[] {
  const words: Word[] = [];
  for (const span of tokenizeInline(text)) {
    const parts = span.text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        if (words.length) words[words.length - 1].sp = true;
        continue;
      }
      words.push({ t: part, b: span.bold, i: span.italic, c: span.code, sp: false });
    }
  }
  return words;
}

function wordsHtml(words: Word[]): string {
  let out = "";
  words.forEach((w, n) => {
    let html = escapeHtml(w.t);
    if (w.c) html = `<code>${html}</code>`;
    if (w.i) html = `<em>${html}</em>`;
    if (w.b) html = `<strong>${html}</strong>`;
    out += html + (w.sp && n < words.length - 1 ? " " : "");
  });
  return out;
}

function inlineHtml(text: string): string {
  return wordsHtml(toWords(text));
}

/**
 * A chapter's text as reader blocks. Narrative books get a scene-break
 * ornament between sections; other books show section titles as headings.
 */
export function chapterBlocks(chapter: ReaderChapter, narrative: boolean): ReaderBlock[] {
  const out: ReaderBlock[] = [];
  let afterBreak = true;
  chapter.sections.forEach((section, sectionIndex) => {
    const blocks = parseManuscriptBlocks(section.content ?? "");
    if (!blocks.length) return;
    if (narrative) {
      if (sectionIndex > 0 && out.length) {
        out.push({ kind: "break" });
        afterBreak = true;
      }
    } else if (section.title && blocks[0].type !== "heading") {
      out.push({ kind: "h", level: 3, text: section.title });
      afterBreak = true;
    }
    for (const block of blocks) {
      switch (block.type) {
        case "paragraph":
        case "quote":
          out.push({
            kind: "p",
            words: toWords(block.text),
            quote: block.type === "quote",
            noIndent: afterBreak,
          });
          afterBreak = false;
          break;
        case "heading":
          out.push({ kind: "h", level: block.level <= 2 ? 3 : 4, text: block.text });
          afterBreak = true;
          break;
        case "list":
          out.push({ kind: "list", ordered: block.ordered, items: block.items.map(toWords) });
          afterBreak = false;
          break;
        case "table":
          out.push({ kind: "table", headers: block.headers, rows: block.rows });
          afterBreak = true;
          break;
        case "figure":
          if (block.src) {
            out.push({
              kind: "figure",
              src: block.src,
              caption: block.caption && block.caption !== "Illustration" ? block.caption : "",
            });
          }
          break;
        case "rule":
          out.push({ kind: "break" });
          afterBreak = true;
          break;
      }
    }
  });
  const first = out.find((b) => b.kind === "p");
  if (first && first.kind === "p" && narrative && !first.quote) first.dropCap = true;
  return out;
}

/** The top of a chapter's first page: its picture, number and title. */
export function chapterHeaderHtml(chapter: ReaderChapter): string {
  const image = chapter.imageUrl
    ? `<div class="ch-img"><img src="${escapeHtml(chapter.imageUrl)}" alt="" decoding="async" /></div>`
    : "";
  return `<header class="ch${chapter.imageUrl ? " has-img" : ""}">${image}<p class="ch-num">Chapter ${chapter.number}</p><h2 class="ch-title">${escapeHtml(chapter.title)}</h2><p class="ch-orn" aria-hidden="true">&#10022;</p></header>`;
}

/**
 * HTML for a block, or for part of one: words [from, to) of a paragraph or
 * items [from, to) of a list. `cont` marks text carried over from the
 * previous page (no indent, no drop cap); `split` marks text that carries on
 * to the next page (last line justified, like print).
 */
export function blockHtml(
  block: ReaderBlock,
  part: { from?: number; to?: number; cont?: boolean; split?: boolean } = {}
): string {
  switch (block.kind) {
    case "p": {
      const words = block.words.slice(part.from ?? 0, part.to ?? block.words.length);
      const cls = [
        block.dropCap && !part.cont ? "dc" : "",
        block.noIndent || part.cont ? "ni" : "",
        part.split ? "sp" : "",
        block.quote ? "q" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<p${cls ? ` class="${cls}"` : ""}>${wordsHtml(words)}</p>`;
    }
    case "h":
      return `<h${block.level} class="hd">${inlineHtml(block.text)}</h${block.level}>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const from = part.from ?? 0;
      const items = block.items.slice(from, part.to ?? block.items.length);
      const start = block.ordered && from > 0 ? ` start="${from + 1}"` : "";
      return `<${tag} class="ls"${start}>${items.map((w) => `<li>${wordsHtml(w)}</li>`).join("")}</${tag}>`;
    }
    case "table":
      return `<div class="tb"><table><thead><tr>${block.headers
        .map((h) => `<th>${inlineHtml(h)}</th>`)
        .join("")}</tr></thead><tbody>${block.rows
        .map((r) => `<tr>${r.map((c) => `<td>${inlineHtml(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`;
    case "figure":
      return `<figure class="fig"><div class="fig-img"><img src="${escapeHtml(block.src)}" alt="${escapeHtml(
        block.caption || "Illustration"
      )}" decoding="async" /></div>${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""}</figure>`;
    case "break":
      return `<p class="brk" aria-hidden="true">&#8258;</p>`;
  }
}

/** Image URLs in a page's HTML, to load the next pages' pictures ahead of a turn. */
export function imagesIn(html: string): string[] {
  return [...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
}
