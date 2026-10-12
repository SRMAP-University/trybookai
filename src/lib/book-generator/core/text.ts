/**
 * Text helpers for model output.
 *
 * Everything under core/ is pure and dependency-free: it is imported by both
 * the Next.js runner (src/lib/book-generator) and the Cloudflare worker
 * (workers/book-generation). Do not import "@/" aliases, Prisma, Node or
 * Workers APIs here.
 */

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  hi: "Hindi",
  ja: "Japanese",
  zh: "Chinese",
  ar: "Arabic",
  ko: "Korean",
  ru: "Russian",
  nl: "Dutch",
  tr: "Turkish",
  pl: "Polish",
  id: "Indonesian",
  bn: "Bengali",
  ur: "Urdu",
};

/** "hi" → "Hindi". Unknown values pass through unchanged. */
export function languageName(code: string | null | undefined): string {
  const raw = (code ?? "").trim();
  if (!raw) return "English";
  const key = raw.toLowerCase();
  return LANGUAGE_NAMES[key] ?? LANGUAGE_NAMES[key.split(/[-_]/)[0]] ?? raw;
}

export function isEnglish(code: string | null | undefined): boolean {
  return languageName(code) === "English";
}

/** Languages written without spaces, where length is measured in characters. */
export function usesCharacterCount(code: string | null | undefined): boolean {
  const name = languageName(code);
  return name === "Japanese" || name === "Chinese";
}

const CJK_CHARS =
  /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ]/g;
const HAS_WORD_CHAR = /[A-Za-z0-9À-￿]/;

/**
 * Word count that also works for Chinese/Japanese: two CJK characters count
 * as one word, which keeps page math comparable across languages.
 */
export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const cjk = (text.match(CJK_CHARS) ?? []).length;
  const rest = cjk ? text.replace(CJK_CHARS, " ") : text;
  const words = rest
    .split(/\s+/)
    .filter((token) => HAS_WORD_CHAR.test(token)).length;
  return words + Math.round(cjk / 2);
}

/** Length instruction in the unit a writer of this language would use. */
export function lengthPhrase(words: number, language: string | null | undefined) {
  const rounded = Math.max(50, Math.round(words / 50) * 50);
  return usesCharacterCount(language)
    ? `${rounded * 2} characters`
    : `${rounded} words`;
}

/**
 * Remove reasoning blocks. Handles paired tags, a closing tag whose opener was
 * swallowed by the provider, and an opener that never closed (no answer yet).
 */
export function stripReasoning(text: string | null | undefined): string {
  let out = (text ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "");
  const lower = out.toLowerCase();
  const strayClose = lower.lastIndexOf("</think>");
  if (strayClose >= 0) out = out.slice(strayClose + "</think>".length);
  const openIdx = out.toLowerCase().indexOf("<think>");
  if (openIdx >= 0) out = out.slice(0, openIdx);
  return out.replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/gi, "").trim();
}

export function extractJsonPayload(text: string): string {
  let cleaned = stripReasoning(text);
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) cleaned = fence[1].trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  return cleaned;
}

/** JSON.parse with the two repairs small models most often need. */
export function parseJsonLoose(text: string): unknown {
  const payload = extractJsonPayload(text);
  try {
    return JSON.parse(payload);
  } catch {
    const repaired = payload
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ");
    return JSON.parse(repaired);
  }
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[*_#`"'“”‘’:.,!?\-–—()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NUMBERED_HEADING = /^(chapter|section|part|scene)\s+(\d+|[ivxlc]+)\b/i;

function isTitleLine(line: string, titleKeys: string[]): boolean {
  const isHeading = /^#{1,6}\s/.test(line) || /^\*\*[^*]+\*\*$/.test(line);
  const stripped = line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*\*([^*]+)\*\*$/, "$1")
    .trim();
  const key = normalizeTitle(stripped);
  if (!key) return false;
  if (titleKeys.includes(key)) return true;
  const withoutNumber = key.replace(/^(chapter|section|part|scene)\s+(\d+|[ivxlc]+)\s*/, "");
  if (withoutNumber !== key && (!withoutNumber || titleKeys.includes(withoutNumber))) {
    return true;
  }
  return (
    NUMBERED_HEADING.test(stripped) &&
    (isHeading || (stripped.length < 80 && !/[.!?]$/.test(stripped)))
  );
}

function isPreamble(line: string): boolean {
  return (
    line.length < 160 &&
    /:\s*$/.test(line) &&
    /^(sure|certainly|of course|okay|ok|absolutely|here|below)\b/i.test(line) &&
    /\b(section|chapter|continuation|draft|manuscript|revis\w*|rewrite|version|text)\b/i.test(line)
  );
}

/** Whole-line notes like "(Word count: 812)", "~800 words", "[End of section]". */
function isTrailingMeta(line: string): boolean {
  if (line.length > 60) return false;
  return (
    /^\(?\s*(approx\.?\s*|total\s*)?word count\s*[:：]?\s*~?\s*[\d,]+\s*(words)?\s*\)?\.?$/i.test(line) ||
    /^\(?\s*(approx\.?\s*|~\s*)?[\d,]+\s+words\s*\)?\.?$/i.test(line) ||
    /^\[?\(?\s*end of (section|chapter|part)\b[^)\]]*[)\]]?\.?$/i.test(line) ||
    /^\(\s*continued\b[^)]*\)$/i.test(line)
  );
}

/**
 * Strip what models add around a section: "Here is the section:" preambles,
 * repeated chapter/section titles, and trailing word counts.
 */
export function cleanSectionOutput(
  text: string,
  titles: { sectionTitle?: string | null; chapterTitle?: string | null } = {}
): string {
  const titleKeys = [titles.sectionTitle, titles.chapterTitle]
    .filter((t): t is string => Boolean(t && t.trim()))
    .map(normalizeTitle);
  const lines = stripReasoning(text).replace(/\r\n/g, "\n").split("\n");

  for (let guard = 0; lines.length && guard < 8; guard++) {
    const line = lines[0].trim();
    if (!line || isPreamble(line) || isTitleLine(line, titleKeys)) {
      lines.shift();
      continue;
    }
    break;
  }

  while (lines.length) {
    const line = lines[lines.length - 1].trim();
    if (!line || /^([-*_])\1{2,}$/.test(line) || isTrailingMeta(line)) {
      lines.pop();
      continue;
    }
    break;
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** True when text ends at a sentence or block boundary rather than mid-thought. */
export function endsCleanly(text: string): boolean {
  const trimmed = text.trimEnd();
  if (!trimmed) return false;
  const lastLine = trimmed.slice(trimmed.lastIndexOf("\n") + 1).trim();
  if (/^\|.*\|$/.test(lastLine) || /^#{1,6}\s/.test(lastLine)) return true;
  if (/^\[FIGURE:.*\]$/i.test(lastLine)) return true;
  return /[.!?…。！？」』"”’')\]*_]$/.test(trimmed);
}

const SENTENCE_END = /[.!?…。！？]["”’')\]*_]*(?=\s|$)/g;

/** Drop a dangling partial sentence left by a max-token cutoff. */
export function trimIncompleteEnding(text: string): string {
  const trimmed = text.trimEnd();
  if (endsCleanly(trimmed)) return trimmed;
  let cut = -1;
  for (const match of trimmed.matchAll(SENTENCE_END)) {
    cut = (match.index ?? 0) + match[0].length;
  }
  if (cut > trimmed.length * 0.5) return trimmed.slice(0, cut).trimEnd();
  const paragraph = trimmed.lastIndexOf("\n\n");
  if (paragraph > trimmed.length * 0.5) return trimmed.slice(0, paragraph).trimEnd();
  return trimmed;
}

/** First `maxChars` of text, cut at a word boundary. */
export function clipText(text: string | null | undefined, maxChars: number): string {
  const value = (text ?? "").trim();
  if (value.length <= maxChars) return value;
  const slice = value.slice(0, Math.max(0, maxChars - 1));
  const space = slice.lastIndexOf(" ");
  return `${(space > maxChars * 0.7 ? slice.slice(0, space) : slice).trimEnd()}…`;
}

/** Last `maxChars` of text, starting at a paragraph or sentence boundary. */
export function tailText(text: string | null | undefined, maxChars: number): string {
  const value = (text ?? "").trim();
  if (value.length <= maxChars) return value;
  let slice = value.slice(value.length - maxChars);
  const paragraph = slice.indexOf("\n\n");
  if (paragraph >= 0 && paragraph < maxChars * 0.35) {
    slice = slice.slice(paragraph + 2);
  } else {
    const sentence = /[.!?。！？]["”’')\]]*\s+/.exec(slice);
    if (sentence && sentence.index < maxChars * 0.35) {
      slice = slice.slice(sentence.index + sentence[0].length);
    }
  }
  return `…${slice.trimStart()}`;
}

/** The first sentence or two, up to maxChars. */
export function firstSentences(text: string | null | undefined, maxChars: number): string {
  const value = (text ?? "").trim();
  if (value.length <= maxChars) return value;
  let cut = -1;
  for (const match of value.slice(0, maxChars).matchAll(SENTENCE_END)) {
    cut = (match.index ?? 0) + match[0].length;
  }
  return cut > maxChars * 0.4 ? value.slice(0, cut) : clipText(value, maxChars);
}

/**
 * Remove text at the start of `addition` that repeats the end of `previous`
 * (continuations often re-emit the last sentence).
 */
export function removeLeadingOverlap(previous: string, addition: string): string {
  const prev = previous.trimEnd();
  const add = addition.trimStart();
  const max = Math.min(600, prev.length, add.length);
  for (let k = max; k >= 20; k--) {
    const atWordEnd = k === add.length || !/[A-Za-z0-9À-￿]/.test(add[k]);
    if (atWordEnd && prev.endsWith(add.slice(0, k))) return add.slice(k).trimStart();
  }
  return add;
}

export function formatList(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function asStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : String(v)))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}
