/**
 * Builds the writer prompt for one section from plain context data. Each
 * runtime loads the data its own way (Prisma / raw SQL) and calls this.
 */

import { composeStorySoFar } from "./canon";
import { isNarrativeBook, resolveContentFormat, sectionOutputHint } from "./format";
import { sectionPageBudget, sectionWordTarget } from "./sizing";
import { buildStyleBlock, type BibleStyle, type StyleSource } from "./style";
import {
  asStringArray,
  clipText,
  languageName,
  lengthPhrase,
  tailText,
} from "./text";
import type { ChatMessage } from "./types";

export type SectionContextInput = {
  book: StyleSource & { title: string; targetPages: number; wordsPerPage: number };
  /** Book.outline JSON — the source of chapter and section plans. */
  outline: unknown;
  bible: BibleStyle;
  /** Bible characters in creation order (main cast first). */
  characters: Array<{ name: string; profile: string | null; aliases?: unknown }>;
  locations: Array<{ name: string; description: string | null }>;
  factions: string[];
  /** Candidate canon facts, newest first. */
  facts: Array<{ subject: string; predicate: string; object: string }>;
  /** Book-level open threads, oldest first. */
  openThreads: string[];
  totalChapters: number;
  chapter: {
    number: number;
    title: string;
    summary: string | null;
    location?: string | null;
    charactersPresent?: unknown;
  };
  nextChapter: { number: number; title: string; summary: string | null } | null;
  /** Chapters before this one, ascending, with their written summaries. */
  priorChapters: Array<{ number: number; title: string; summary: string | null }>;
  /** Every section in this chapter, ascending. `summary` is the post-write summary. */
  chapterSections: Array<{
    number: number;
    title: string;
    done: boolean;
    summary: string | null;
  }>;
  section: { number: number; title: string };
  /** The previous section's text (same chapter, or the last one of the previous chapter). */
  previousText: { content: string; fromPreviousChapter: boolean } | null;
  /** 0-based position of this section in the whole book, and the book's section count. */
  bookPosition: { index: number; total: number };
};

export type ComposedSectionPrompt = {
  messages: ChatMessage[];
  system: string;
  userPrompt: string;
  systemStyle: string;
  core: string;
  current: string;
  retrieved: string;
  immediate: string;
  approxTokens: number;
  targetWords: number;
  pageBudget: number;
  /** Facts shown to the writer; passed to the continuity check. */
  factsBrief: string;
};

const BUDGET = {
  synopsis: 1600,
  storySoFar: 3200,
  current: 7000,
  retrieved: 5000,
  previousSameChapter: 4800,
  previousChapter: 2400,
} as const;

type LooseEntry = { number?: unknown; title?: unknown; summary?: unknown; sections?: unknown };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sameTitle(a: unknown, b: string): boolean {
  return text(a).toLowerCase() === b.trim().toLowerCase();
}

function looseList(value: unknown): LooseEntry[] {
  return Array.isArray(value) ? (value as LooseEntry[]) : [];
}

/** Outline entry for a chapter: by title first (survives renumbering), then by number. */
function findOutlineChapter(outline: unknown, number: number, title: string) {
  const chapters = looseList((outline as { chapters?: unknown } | null)?.chapters);
  return (
    chapters.find((c) => sameTitle(c.title, title)) ??
    chapters.find((c) => Number(c.number) === number) ??
    null
  );
}

function findOutlineSection(chapter: LooseEntry | null, number: number, title: string) {
  const sections = looseList(chapter?.sections);
  return (
    sections.find((s) => sameTitle(s.title, title)) ??
    sections.find((s) => Number(s.number) === number) ??
    null
  );
}

const ESCAPE = /[.*+?^${}()|[\]\\]/g;
const WORD_EDGE = "A-Za-z0-9\\u00C0-\\u024F";
const HONORIFICS = new Set([
  "the", "a", "an", "dr", "dr.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "sir",
  "lady", "lord", "king", "queen", "prince", "princess", "captain", "professor",
  "uncle", "aunt", "old", "young", "little",
]);

function mentions(haystack: string, name: string): boolean {
  const needle = name.trim();
  if (needle.length < 3) return false;
  return new RegExp(
    `(^|[^${WORD_EDGE}])${needle.replace(ESCAPE, "\\$&")}($|[^${WORD_EDGE}])`,
    "i"
  ).test(haystack);
}

/** Full name, aliases, and a bare first name ("Elena" for "Elena Voss"). */
function nameVariants(name: string, aliases?: unknown): string[] {
  const variants = [name, ...asStringArray(aliases)];
  const tokens = name.trim().split(/\s+/);
  if (tokens.length > 1 && !HONORIFICS.has(tokens[0].toLowerCase()) && tokens[0].length >= 3) {
    variants.push(tokens[0]);
  }
  return variants;
}

function roleText(
  narrative: boolean,
  chapterNumber: number,
  flags: { firstOfBook: boolean; lastOfBook: boolean; firstInChapter: boolean; lastInChapter: boolean }
): string {
  const lines: string[] = [];
  if (flags.firstOfBook) {
    lines.push(
      narrative
        ? "This opens the book: hook the reader at once and establish the protagonist, setting and tone through action rather than exposition."
        : "This opens the book: show the reader why the subject matters to them and what they will gain, then start delivering — no long preamble."
    );
  } else if (flags.firstInChapter) {
    lines.push(
      narrative
        ? `This opens Chapter ${chapterNumber}: re-orient the reader quickly (who, where, when) and pick up from the end of the previous chapter.`
        : `This opens Chapter ${chapterNumber}: introduce the chapter's topic and connect it briefly to what came before — no long recap.`
    );
  }
  if (flags.lastOfBook) {
    lines.push(
      narrative
        ? "This is the final section of the book: resolve the central conflict and the main open threads, and give the book a satisfying ending."
        : "This is the final section of the book: bring the book's ideas together and close with a concrete, memorable ending rather than a generic summary."
    );
  } else if (flags.lastInChapter) {
    lines.push(
      narrative
        ? `This closes Chapter ${chapterNumber}: end on a strong beat — a turn, revelation or decision — that pulls the reader onward, without starting the next chapter's events.`
        : `This closes Chapter ${chapterNumber}: land the chapter's key ideas with a short, specific wrap-up; don't preview the next chapter at length.`
    );
  }
  if (!lines.length) {
    lines.push(
      narrative
        ? "This continues the chapter: advance it from where the previous section ended."
        : "This continues the chapter: build on the previous section."
    );
  }
  return lines.join(" ");
}

export function composeSectionPrompt(input: SectionContextInput): ComposedSectionPrompt {
  const { book, chapter, section } = input;
  const formatInput = {
    genre: book.genre,
    templateId: book.templateId,
    description: book.description,
    customInstructions: book.customInstructions,
    includeExamples: book.includeExamples,
  };
  const narrative = isNarrativeBook(formatInput);
  const format = resolveContentFormat(formatInput);
  const total = Math.max(1, input.bookPosition.total);
  const index = Math.min(Math.max(0, input.bookPosition.index), total - 1);
  const targetWords = sectionWordTarget(book, total);
  const pageBudget = sectionPageBudget(book.targetPages, total, index);

  const outlineChapter = findOutlineChapter(input.outline, chapter.number, chapter.title);
  const chapterPlan = text(outlineChapter?.summary) || chapter.summary || "";
  const synopsis =
    text((input.outline as { synopsis?: unknown } | null)?.synopsis) || book.description || "";
  const planFor = (s: { number: number; title: string }) =>
    text(findOutlineSection(outlineChapter, s.number, s.title)?.summary);
  const sectionPlan = planFor(section);

  const siblings = input.chapterSections.length
    ? input.chapterSections
    : [{ ...section, done: false, summary: null }];
  const position = Math.max(0, siblings.findIndex((s) => s.number === section.number));
  const flags = {
    firstOfBook: index === 0,
    lastOfBook: index === total - 1,
    firstInChapter: position === 0,
    lastInChapter: position === siblings.length - 1,
  };

  // ── BOOK ────────────────────────────────────────────────────────────────
  const core = [
    "BOOK",
    `"${book.title}" — ${book.genre ?? "general"} — ${input.totalChapters} chapter${input.totalChapters === 1 ? "" : "s"}`,
    synopsis ? `Synopsis: ${clipText(synopsis, BUDGET.synopsis)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // ── STORY SO FAR + THIS CHAPTER ─────────────────────────────────────────
  const storySoFar = composeStorySoFar(input.priorChapters, BUDGET.storySoFar);
  const roadmap = siblings
    .map((s) => {
      const label = `${s.number}. "${s.title}"`;
      if (s.number === section.number) return `${label} — ▶ you are writing this now`;
      if (s.done) {
        return `${label} — already written: ${clipText(s.summary || planFor(s), 420) || "(done)"}`;
      }
      const plan = planFor(s);
      return `${label} — comes later, do not cover yet${plan ? `: ${clipText(plan, 220)}` : ""}`;
    })
    .join("\n");
  const next = input.nextChapter;
  const current = clipText(
    [
      storySoFar ? `${narrative ? "STORY SO FAR" : "COVERED SO FAR"}\n${storySoFar}\n` : null,
      `THIS CHAPTER — Chapter ${chapter.number} of ${input.totalChapters}: "${chapter.title}"`,
      chapterPlan ? `Plan: ${clipText(chapterPlan, 1200)}` : null,
      `Sections:\n${roadmap}`,
      next
        ? `Next: Chapter ${next.number} "${next.title}"${next.summary ? ` — ${clipText(next.summary, 280)}` : ""} (do not start it).`
        : "This is the final chapter of the book.",
    ]
      .filter(Boolean)
      .join("\n"),
    BUDGET.current
  );

  // ── CONTINUITY ──────────────────────────────────────────────────────────
  const doneSummaries = siblings
    .filter((s) => s.done)
    .map((s) => s.summary ?? "")
    .join(" ");
  const focus = [
    section.title,
    sectionPlan,
    chapter.title,
    chapterPlan,
    doneSummaries,
    chapter.location ?? "",
    asStringArray(chapter.charactersPresent).join(", "),
    input.previousText ? tailText(input.previousText.content, 3000) : "",
  ].join("\n");

  const matchedChars = input.characters.filter((c) =>
    nameVariants(c.name, c.aliases).some((v) => mentions(focus, v))
  );
  const chars = [...matchedChars];
  for (const c of input.characters) {
    if (chars.length >= 5) break;
    if (!chars.includes(c)) chars.push(c);
  }
  const shownChars = chars.slice(0, 8);
  const places = input.locations.filter((l) => mentions(focus, l.name)).slice(0, 6);
  const entityNames = [
    ...shownChars.flatMap((c) => nameVariants(c.name, c.aliases)),
    ...places.map((l) => l.name),
  ];
  const relevantFacts = input.facts.filter(
    (f) =>
      mentions(focus, f.subject) ||
      entityNames.some((n) => mentions(f.subject, n) || mentions(f.object, n))
  );
  const facts = (relevantFacts.length ? relevantFacts : input.facts).slice(
    0,
    relevantFacts.length ? 20 : 10
  );
  const onStage = asStringArray(chapter.charactersPresent).slice(-6);
  const anyDone = siblings.some((s) => s.done);

  const retrieved = clipText(
    [
      "CONTINUITY (stay consistent with these)",
      shownChars.length
        ? `Characters / people:\n${shownChars
            .map((c) => `- ${c.name}${c.profile ? `: ${clipText(c.profile, 240)}` : ""}`)
            .join("\n")}`
        : null,
      places.length
        ? `Places:\n${places
            .map((l) => `- ${l.name}${l.description ? `: ${clipText(l.description, 200)}` : ""}`)
            .join("\n")}`
        : null,
      input.factions.length ? `Factions: ${input.factions.slice(0, 6).join(", ")}` : null,
      facts.length
        ? `Established facts:\n${facts.map((f) => `- ${f.subject} ${f.predicate} ${f.object}`).join("\n")}`
        : null,
      input.openThreads.length
        ? `Open threads: ${input.openThreads.slice(-8).join("; ")}`
        : null,
      anyDone && (chapter.location || onStage.length)
        ? `Where things stand: ${[
            chapter.location ? `location — ${chapter.location}` : null,
            onStage.length ? `present — ${onStage.join(", ")}` : null,
          ]
            .filter(Boolean)
            .join("; ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
    BUDGET.retrieved
  );

  // ── PREVIOUS TEXT ───────────────────────────────────────────────────────
  const prev = input.previousText;
  const immediate = prev?.content.trim()
    ? `PREVIOUS TEXT — the last lines of ${prev.fromPreviousChapter ? "the previous chapter" : "the previous section"}. Continue from here; do not repeat or paraphrase it:\n"""\n${tailText(
        prev.content,
        prev.fromPreviousChapter ? BUDGET.previousChapter : BUDGET.previousSameChapter
      )}\n"""`
    : "PREVIOUS TEXT — none: this is the first section of the book.";

  // ── TASK ────────────────────────────────────────────────────────────────
  const beats = Math.min(8, Math.max(2, Math.round(targetWords / 350)));
  const units = narrative
    ? "beats or scenes"
    : format.wantsSubheadings
      ? "subsections (## headings)"
      : "parts";
  const task = [
    `YOUR SECTION — Section ${position + 1} of ${siblings.length} in Chapter ${chapter.number}: "${section.title}"`,
    `Plan: ${sectionPlan || "Not specified — infer it from the title and the chapter plan."}`,
    `Role: ${roleText(narrative, chapter.number, flags)}`,
    `Length: about ${lengthPhrase(targetWords, book.language)}. Develop it across roughly ${beats} ${units}, ${narrative ? "showing rather than summarizing" : "with concrete explanation and examples"}.`,
    "",
    "Rules:",
    "- Begin exactly where the previous text stops. Don't recap earlier sections or re-introduce characters and ideas the reader already knows.",
    "- Cover this section's plan fully, then stop. Leave material planned for later sections to them.",
    narrative
      ? "- Don't end on a summary or a moral."
      : "- Don't end with a recap or a preview of the next section.",
    `- ${sectionOutputHint(format)}`,
  ].join("\n");

  const systemStyle = buildStyleBlock(book, { bible: input.bible });
  const language = languageName(book.language);
  const author = book.genre ? `${book.genre} author` : "author";
  const system = `You are an accomplished ${author} writing "${book.title}" in ${language}. The book is written one section at a time; your section must read as a seamless part of the whole — consistent with the continuity notes, continuing directly from the previous text, and covering only its own plan.
Output only the section's text: no title, preamble, notes or word count.

Writing requirements:
${systemStyle}`;

  const userPrompt = [core, current, retrieved, immediate, task].join("\n\n");

  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    system,
    userPrompt,
    systemStyle,
    core,
    current,
    retrieved,
    immediate,
    approxTokens: Math.ceil((system.length + userPrompt.length) / 4),
    targetWords,
    pageBudget,
    factsBrief: facts
      .slice(0, 16)
      .map((f) => `${f.subject} ${f.predicate} ${f.object}`)
      .join("\n"),
  };
}
