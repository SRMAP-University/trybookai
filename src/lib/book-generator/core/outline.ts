/**
 * Outline planning. Small books are planned in one call; larger books get a
 * chapter-level arc first, then section plans in batches that each see the
 * whole arc. Every response is validated and retried once with feedback.
 */

import { isNarrativeBook } from "./format";
import { tokensPerWord } from "./sizing";
import { clipText, languageName, lengthPhrase, parseJsonLoose } from "./text";
import type { ChatMessage, LlmCall } from "./types";

export type OutlineSection = { number: number; title: string; summary: string };
export type OutlineChapter = {
  number: number;
  title: string;
  summary: string;
  sections: OutlineSection[];
};
export type OutlineCastMember = { name: string; role: string; description: string };
export type OutlinePlace = { name: string; description: string };
export type BookOutline = {
  title: string;
  synopsis: string;
  characters: OutlineCastMember[];
  settings: OutlinePlace[];
  chapters: OutlineChapter[];
};

export type OutlineRequest = {
  title: string;
  genre: string | null;
  description: string | null;
  templateId?: string | null;
  customInstructions: string | null;
  includeExamples: boolean;
  language: string;
  targetPages: number;
  wordsPerPage: number;
  chapterCount: number;
  sectionsPerChapter: number;
  /** buildStyleBlock(book, { includeCast: true }) */
  styleBlock: string;
};

/** Up to this many sections are planned in a single call. */
const SINGLE_CALL_MAX_SECTIONS = 24;
const SECTIONS_PER_BATCH = 24;
const BATCH_CONCURRENCY = 3;
/** Planned output size for one call; leaves headroom under the 8192 cap for retries. */
const CALL_TOKEN_TARGET = 5500;
/** Approximate output tokens per planned item, in English. */
const TOKENS = { base: 900, chapter: 160, section: 150 } as const;

const NARRATIVE_RULES = [
  "- Shape the chapters into one complete arc: establish the protagonist, world and central conflict early; escalate with complications and reversals through the middle; build to a climax near the end; resolve the central conflict in the final chapter.",
  "- Each section is one scene or sequence with a goal, an obstacle and an outcome that changes the situation. Name the characters involved.",
  "- Keep names, relationships and facts consistent across the whole plan.",
];

const TEACHING_RULES = [
  "- Order chapters so understanding builds: foundations first, then methods and application, then advanced topics, ending with synthesis or an action plan.",
  "- Each section owns a distinct sub-topic and names the specific concepts, steps, examples or cases it covers.",
  "- Plan sections that naturally include comparisons, frameworks, tables, or visual explanations when those help the reader.",
];

const CAST_RULE =
  "- characters: the main recurring characters or real people (at most 8; an empty array if there are none). settings: key recurring places (at most 6; may be empty).";

function sectionRules(req: OutlineRequest, narrative: boolean): string[] {
  return [
    '- Each section summary is 2–3 sentences saying concretely what happens or what is covered (names, events, concepts, examples) and where the section ends up. No vague teasers such as "explores" or "delves into".',
    '- Section titles are unique and specific. Do not reuse generic titles such as "Introduction" or "Conclusion" in every chapter.',
    "- No two sections may cover the same events or material; every section moves the book forward.",
    ...(narrative ? NARRATIVE_RULES : TEACHING_RULES),
    `- Write every title, summary and description in ${languageName(req.language)}; keep the JSON keys in English.`,
  ];
}

function briefing(req: OutlineRequest): string {
  const totalWords = req.targetPages * req.wordsPerPage;
  const perSection = totalWords / Math.max(1, req.chapterCount * req.sectionsPerChapter);
  return [
    `Plan a ${req.targetPages}-page ${req.genre ?? "general"} book titled "${req.title}" (about ${totalWords.toLocaleString("en-US")} words; each section is roughly ${lengthPhrase(perSection, req.language)}).`,
    req.description ? `Description: ${req.description}` : null,
    "",
    "Writing requirements:",
    req.styleBlock,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function fullOutlineMessages(req: OutlineRequest, narrative: boolean): ChatMessage[] {
  const system = [
    "You are an expert book architect. Another writer will draft this book one section at a time, seeing only your plan for each section, so the plan must be specific and internally consistent.",
    "",
    "Return only JSON with this shape:",
    '{"title": string, "synopsis": string, "characters": [{"name": string, "role": string, "description": string}], "settings": [{"name": string, "description": string}], "chapters": [{"title": string, "summary": string, "sections": [{"title": string, "summary": string}]}]}',
    "",
    "Rules:",
    `- Exactly ${req.chapterCount} chapters, each with exactly ${req.sectionsPerChapter} sections.`,
    "- synopsis: 3–5 sentences covering the whole book, including how it ends.",
    CAST_RULE,
    "- Chapter summary: 2–3 sentences on what the chapter covers and how it changes the situation or the reader's understanding.",
    ...sectionRules(req, narrative),
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: briefing(req) },
  ];
}

function skeletonMessages(req: OutlineRequest, narrative: boolean): ChatMessage[] {
  const system = [
    "You are an expert book architect. First you plan the book's chapters; the sections inside each chapter are planned afterwards from your chapter summaries, so they must be specific and internally consistent.",
    "",
    "Return only JSON with this shape:",
    '{"title": string, "synopsis": string, "characters": [{"name": string, "role": string, "description": string}], "settings": [{"name": string, "description": string}], "chapters": [{"title": string, "summary": string}]}',
    "",
    "Rules:",
    `- Exactly ${req.chapterCount} chapters.`,
    "- synopsis: 3–5 sentences covering the whole book, including how it ends.",
    CAST_RULE,
    "- Chapter summary: 3–4 sentences naming the chapter's key events or topics in order and how it ends.",
    "- Chapter titles are unique and specific; no two chapters cover the same ground.",
    ...(narrative ? NARRATIVE_RULES : TEACHING_RULES),
    `- Write every title, summary and description in ${languageName(req.language)}; keep the JSON keys in English.`,
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: briefing(req) },
  ];
}

function sectionBatchMessages(
  req: OutlineRequest,
  narrative: boolean,
  skeleton: BookOutline,
  batch: OutlineChapter[]
): ChatMessage[] {
  const first = batch[0].number;
  const last = batch[batch.length - 1].number;
  const requested = new Set(batch.map((c) => c.number));
  const system = [
    "You are an expert book architect planning the sections of specific chapters. The whole book's plan is given; another writer drafts each section from your plan alone.",
    "",
    "Return only JSON with this shape:",
    '{"chapters": [{"number": number, "sections": [{"title": string, "summary": string}]}]}',
    "",
    "Rules:",
    `- Plan only the requested chapters, each with exactly ${req.sectionsPerChapter} sections, in order.`,
    "- The sections of a chapter together deliver that chapter's summary — nothing from other chapters.",
    ...sectionRules(req, narrative),
  ].join("\n");

  const cast = skeleton.characters
    .map((c) => `- ${c.name}${c.role ? ` (${c.role})` : ""}${c.description ? `: ${c.description}` : ""}`)
    .join("\n");
  const chapterPlan = skeleton.chapters
    .map((c) =>
      requested.has(c.number)
        ? `${c.number}. "${c.title}" — ${c.summary}`
        : `${c.number}. "${c.title}" — ${clipText(c.summary, 240)}`
    )
    .join("\n");

  const user = [
    briefing(req),
    "",
    `Synopsis: ${skeleton.synopsis}`,
    cast ? `Characters:\n${cast}` : null,
    "",
    "Chapter plan:",
    chapterPlan,
    "",
    first === last
      ? `Plan the sections for chapter ${first}.`
      : `Plan the sections for chapters ${first}–${last}.`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

type Normalized<T> = { value: T | null; problems: string[] };

function str(value: unknown, max: number): string {
  if (typeof value === "string") return value.trim().slice(0, max);
  if (typeof value === "number") return String(value);
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") return { title: value };
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeSections(raw: unknown, expected: number): OutlineSection[] {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map(asRecord)
    .map((s) => ({
      title: str(s.title ?? s.name, 200),
      summary: str(s.summary ?? s.description, 900),
    }))
    .filter((s) => s.title || s.summary)
    .slice(0, expected)
    .map((s, i) => ({
      number: i + 1,
      title: s.title || `Section ${i + 1}`,
      summary: s.summary,
    }));
}

function normalizeCast(raw: unknown): OutlineCastMember[] {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map(asRecord)
    .map((c) => ({
      name: str(c.name ?? c.title, 120),
      role: str(c.role, 160),
      description: str(c.description ?? c.summary, 500),
    }))
    .filter((c) => c.name)
    .slice(0, 8);
}

function normalizePlaces(raw: unknown): OutlinePlace[] {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map(asRecord)
    .map((p) => ({
      name: str(p.name ?? p.title, 120),
      description: str(p.description ?? p.summary, 400),
    }))
    .filter((p) => p.name)
    .slice(0, 6);
}

function normalizeBook(
  parsed: unknown,
  req: OutlineRequest,
  withSections: boolean
): Normalized<BookOutline> {
  const root = asRecord(parsed);
  const rawChapters = Array.isArray(root.chapters) ? root.chapters : [];
  const problems: string[] = [];

  const chapters = rawChapters
    .map(asRecord)
    .filter((c) => str(c.title, 1) || str(c.summary, 1))
    .slice(0, req.chapterCount)
    .map((c, i) => ({
      number: i + 1,
      title: str(c.title, 200) || `Chapter ${i + 1}`,
      summary: str(c.summary ?? c.description, 1200),
      sections: withSections ? normalizeSections(c.sections, req.sectionsPerChapter) : [],
    }));

  if (chapters.length === 0) {
    return { value: null, problems: ['The JSON had no "chapters".'] };
  }
  if (chapters.length < req.chapterCount) {
    problems.push(
      `It had ${chapters.length} chapters; exactly ${req.chapterCount} are required.`
    );
  }
  if (withSections) {
    const short = chapters.filter((c) => c.sections.length < req.sectionsPerChapter);
    if (short.length) {
      problems.push(
        `Chapters ${short.map((c) => c.number).join(", ")} have fewer than ${req.sectionsPerChapter} sections.`
      );
    }
  }

  return {
    value: {
      title: str(root.title, 200) || req.title,
      synopsis: str(root.synopsis, 2000) || req.description || "",
      characters: normalizeCast(root.characters),
      settings: normalizePlaces(root.settings ?? root.locations),
      chapters,
    },
    problems,
  };
}

function normalizeSectionBatch(
  parsed: unknown,
  batch: OutlineChapter[],
  expected: number
): Normalized<OutlineSection[][]> {
  const root = asRecord(parsed);
  const entries = (Array.isArray(root.chapters) ? root.chapters : []).map(asRecord);
  if (entries.length === 0) {
    return { value: null, problems: ['The JSON had no "chapters".'] };
  }
  const value = batch.map((chapter, i) => {
    const match =
      entries.find((e) => Number(e.number) === chapter.number) ?? entries[i];
    return normalizeSections(match?.sections, expected);
  });
  const short = batch.filter((_, i) => value[i].length < expected);
  return {
    value,
    problems: short.length
      ? [
          `Chapters ${short.map((c) => c.number).join(", ")} need exactly ${expected} sections each.`,
        ]
      : [],
  };
}

function withFeedback(messages: ChatMessage[], feedback: string): ChatMessage[] {
  const last = messages[messages.length - 1];
  return [
    ...messages.slice(0, -1),
    {
      ...last,
      content: `${last.content}\n\nYour previous answer had a problem: ${feedback} Return the complete corrected JSON.`,
    },
  ];
}

/** One structured request with a single corrective retry; best effort wins over failure. */
async function requestJson<T>(
  call: LlmCall,
  messages: ChatMessage[],
  maxTokens: number,
  normalize: (parsed: unknown) => Normalized<T>
): Promise<T> {
  let feedback = "";
  let best: T | null = null;
  let budget = maxTokens;

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await call(attempt === 0 ? messages : withFeedback(messages, feedback), {
      max_tokens: Math.min(8192, Math.ceil(budget)),
      temperature: attempt === 0 ? 0.5 : 0.3,
      purpose: "outline",
    });

    let parsed: unknown;
    try {
      parsed = parseJsonLoose(result.text);
    } catch {
      // A cut-off answer gets more room as well as a request to be brief.
      if (result.truncated) budget *= 1.6;
      feedback = result.truncated
        ? "It was cut off before the JSON was complete. Keep every summary shorter."
        : "It was not valid JSON. Return a single JSON object and nothing else.";
      continue;
    }

    const { value, problems } = normalize(parsed);
    if (value && problems.length === 0) return value;
    if (value) best = value;
    feedback = problems.join(" ");
  }

  if (best) return best;
  throw new Error(`Outline planning failed: ${feedback}`);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** A chapter the planner left empty still needs one section to write. */
function ensureSections(chapter: OutlineChapter): OutlineChapter {
  if (chapter.sections.length) return chapter;
  return {
    ...chapter,
    sections: [{ number: 1, title: chapter.title, summary: chapter.summary }],
  };
}

export async function planBookOutline(
  req: OutlineRequest,
  call: LlmCall,
  onProgress?: (message: string) => void
): Promise<BookOutline> {
  const narrative = isNarrativeBook(req);
  const chapters = req.chapterCount;
  const sections = req.sectionsPerChapter;
  // Non-Latin scripts need several times the tokens for the same plan.
  const scale = Math.max(1, tokensPerWord(req.language) / tokensPerWord("en"));
  const fullBudget =
    (TOKENS.base + chapters * TOKENS.chapter + chapters * sections * TOKENS.section) * scale;

  if (chapters * sections <= SINGLE_CALL_MAX_SECTIONS && fullBudget <= CALL_TOKEN_TARGET) {
    onProgress?.(`Planning ${chapters} chapters × ${sections} sections…`);
    const outline = await requestJson(
      call,
      fullOutlineMessages(req, narrative),
      fullBudget,
      (parsed) => normalizeBook(parsed, req, true)
    );
    return { ...outline, chapters: outline.chapters.map(ensureSections) };
  }

  onProgress?.(`Planning the arc across ${chapters} chapters…`);
  const skeleton = await requestJson(
    call,
    skeletonMessages(req, narrative),
    (TOKENS.base + chapters * TOKENS.chapter) * scale,
    (parsed) => normalizeBook(parsed, req, false)
  );

  const sectionsPerBatch = Math.min(
    SECTIONS_PER_BATCH,
    Math.floor(CALL_TOKEN_TARGET / (TOKENS.section * scale))
  );
  const perBatch = Math.max(1, Math.floor(sectionsPerBatch / sections));
  const batches: OutlineChapter[][] = [];
  for (let i = 0; i < skeleton.chapters.length; i += perBatch) {
    batches.push(skeleton.chapters.slice(i, i + perBatch));
  }

  let planned = 0;
  const batchSections = await mapWithConcurrency(batches, BATCH_CONCURRENCY, async (batch) => {
    const result = await requestJson(
      call,
      sectionBatchMessages(req, narrative, skeleton, batch),
      (400 + batch.length * (40 + sections * TOKENS.section)) * scale,
      (parsed) => normalizeSectionBatch(parsed, batch, sections)
    );
    planned += batch.length;
    onProgress?.(`Planned sections for ${planned} of ${skeleton.chapters.length} chapters…`);
    return result;
  });

  return {
    ...skeleton,
    chapters: batches.flatMap((batch, b) =>
      batch.map((chapter, i) =>
        ensureSections({ ...chapter, sections: batchSections[b][i] ?? [] })
      )
    ),
  };
}
