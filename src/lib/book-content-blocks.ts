export type ManuscriptBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "figure"; caption: string; src?: string }
  | { type: "quote"; text: string }
  | { type: "rule" };

function splitRow(line: string): string[] {
  let cells = line.trim();
  if (cells.startsWith("|")) cells = cells.slice(1);
  if (cells.endsWith("|")) cells = cells.slice(0, -1);
  return cells.split("|").map((c) => c.trim());
}

function isSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}.*\|/.test(line);
}

function parseFigure(line: string): { caption: string; src?: string } | null {
  const marker = line.match(/^\[FIGURE:\s*(.+?)\]\s*$/i);
  if (marker) return { caption: marker[1].trim() };
  const md = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
  if (md) return { caption: md[1].trim() || "Illustration", src: md[2].trim() };
  return null;
}

export function parseManuscriptBlocks(content: string): ManuscriptBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ManuscriptBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: "rule" });
      i += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3 | 4;
      blocks.push({ type: "heading", level, text: heading[2].trim() });
      i += 1;
      continue;
    }

    const figure = parseFigure(trimmed);
    if (figure) {
      blocks.push({ type: "figure", ...figure });
      i += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", text: quote.join(" ") });
      continue;
    }

    if (trimmed.includes("|") && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const headers = splitRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && !isSeparator(lines[i])) {
        if (lines[i].trim()) rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const items: string[] = [];
      const isOrdered = Boolean(ordered);
      while (i < lines.length) {
        const item = isOrdered
          ? lines[i].trim().match(/^\d+[.)]\s+(.+)$/)
          : lines[i].trim().match(/^[-*+]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        i += 1;
      }
      blocks.push({ type: "list", ordered: isOrdered, items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim()) {
      const next = lines[i].trim();
      if (
        /^(#{1,4})\s+/.test(next) ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(next) ||
        parseFigure(next) ||
        next.startsWith(">") ||
        /^[-*+]\s+/.test(next) ||
        /^\d+[.)]\s+/.test(next) ||
        (next.includes("|") && i + 1 < lines.length && isSeparator(lines[i + 1]))
      ) {
        break;
      }
      para.push(next);
      i += 1;
    }
    if (para.length) {
      blocks.push({ type: "paragraph", text: para.join(" ") });
    }
  }

  return blocks;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function inlineHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function blocksToHtml(content: string): string {
  const blocks = parseManuscriptBlocks(content);
  if (!blocks.length) return "<p><em>Not generated yet.</em></p>";

  return (
    blocks
      .map((block) => {
        if (block.type === "heading") {
          const level = Math.min(Math.max(block.level, 1), 4);
          return `<h${level}>${inlineHtml(block.text)}</h${level}>`;
        }
        if (block.type === "quote") {
          return `<blockquote>${inlineHtml(block.text)}</blockquote>`;
        }
        if (block.type === "list") {
          const tag = block.ordered ? "ol" : "ul";
          return `<${tag}>${block.items
            .map((item) => `<li>${inlineHtml(item)}</li>`)
            .join("")}</${tag}>`;
        }
        if (block.type === "table") {
          return [
            "<table><thead><tr>",
            ...block.headers.map((h) => `<th>${inlineHtml(h)}</th>`),
            "</tr></thead><tbody>",
            ...block.rows.map(
              (row) =>
                `<tr>${row.map((cell) => `<td>${inlineHtml(cell)}</td>`).join("")}</tr>`
            ),
            "</tbody></table>",
          ].join("");
        }
        if (block.type === "figure") {
          if (block.src) {
            return `<figure><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.caption)}" /><figcaption>${inlineHtml(block.caption)}</figcaption></figure>`;
          }
          return `<figure><p><em>Illustration:</em> ${inlineHtml(block.caption)}</p></figure>`;
        }
        if (block.type === "rule") return "<hr />";
        return `<p>${inlineHtml(block.text)}</p>`;
      })
      .join("\n") || "<p><em>Not generated yet.</em></p>"
  );
}

export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

export type InlineSpan = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
};

export function tokenizeInline(text: string): InlineSpan[] {
  const parts: InlineSpan[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) {
      parts.push({ text: text.slice(last, match.index) });
    }
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push({ text: token.slice(2, -2), bold: true });
    } else if (token.startsWith("*")) {
      parts.push({ text: token.slice(1, -1), italic: true });
    } else {
      parts.push({ text: token.slice(1, -1), code: true });
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts.length ? parts : [{ text }];
}
