/** Continuity ledger: per-section extraction, state merging and chapter summaries. */

import {
  asStringArray,
  clipText,
  firstSentences,
  parseJsonLoose,
  stripReasoning,
  tailText,
} from "./text";
import type { ChatMessage } from "./types";

export type CanonFactInput = { subject: string; predicate: string; object: string };

export type SectionUpdate = {
  sectionSummary: string;
  objective?: string;
  charactersPresent: string[];
  location?: string;
  events: string[];
  newFacts: CanonFactInput[];
  openThreads: string[];
  resolvedThreads: string[];
  contradictions: string[];
};

/** Long sections keep their opening and their ending — the ending matters most for continuity. */
function proseForExtraction(content: string): string {
  if (content.length <= 14000) return content;
  return `${content.slice(0, 5000)}\n\n[…]\n\n${content.slice(-9000)}`;
}

export function buildExtractMessages(input: {
  sectionTitle: string;
  content: string;
  knownFacts?: string;
  openThreads?: string[];
}): ChatMessage[] {
  const threads = (input.openThreads ?? []).slice(-12);
  return [
    {
      role: "system",
      content: `You keep the continuity notes for a book that is written one section at a time. Read the section and return only JSON:
{
  "sectionSummary": "120–180 words: what happens or is covered, in order, including exactly how the section ends",
  "objective": "one sentence: what this section accomplished for the book",
  "charactersPresent": ["characters or people who appear"],
  "location": "where the section ends up, or null",
  "events": ["key events or points, at most 6"],
  "newFacts": [{"subject": "", "predicate": "", "object": ""}],
  "openThreads": ["new unresolved questions, promises or setups raised here"],
  "resolvedThreads": ["entries from OPEN THREADS that this section resolves, copied exactly"],
  "contradictions": ["direct conflicts with a KNOWN FACT, quoting both"]
}
- newFacts: at most 8 durable facts that later sections must respect (names, relationships, ages, appearance, places, dates, rules, decisions, definitions). Skip trivia.
- contradictions: only clear, direct conflicts with KNOWN FACTS; otherwise an empty array. Different wording or new detail is not a contradiction.
- Write the summary in English, but keep names exactly as they appear in the text.`,
    },
    {
      role: "user",
      content: `Section: "${input.sectionTitle}"

KNOWN FACTS:
${input.knownFacts?.trim() || "(none yet)"}

OPEN THREADS:
${threads.length ? threads.map((t) => `- ${t}`).join("\n") : "(none)"}

SECTION TEXT:
${proseForExtraction(input.content)}`,
    },
  ];
}

export function parseSectionUpdate(raw: string): SectionUpdate {
  try {
    const parsed = parseJsonLoose(raw) as Record<string, unknown>;
    const facts = Array.isArray(parsed.newFacts) ? parsed.newFacts : [];
    return {
      sectionSummary: String(parsed.sectionSummary ?? "").trim().slice(0, 1500),
      objective: parsed.objective ? String(parsed.objective).slice(0, 400) : undefined,
      charactersPresent: asStringArray(parsed.charactersPresent).slice(0, 12),
      location:
        parsed.location && parsed.location !== "null"
          ? String(parsed.location).slice(0, 120)
          : undefined,
      events: asStringArray(parsed.events).slice(0, 12),
      newFacts: facts
        .map((f) => {
          const fact = (f ?? {}) as Partial<CanonFactInput>;
          return {
            subject: String(fact.subject ?? "").trim().slice(0, 120),
            predicate: String(fact.predicate ?? "").trim().slice(0, 80),
            object: String(fact.object ?? "").trim().slice(0, 240),
          };
        })
        .filter((f) => f.subject && f.predicate && f.object)
        .slice(0, 12),
      openThreads: asStringArray(parsed.openThreads).slice(0, 10),
      resolvedThreads: asStringArray(parsed.resolvedThreads).slice(0, 10),
      contradictions: asStringArray(parsed.contradictions).slice(0, 8),
    };
  } catch {
    return {
      sectionSummary: clipText(stripReasoning(raw), 400),
      charactersPresent: [],
      events: [],
      newFacts: [],
      openThreads: [],
      resolvedThreads: [],
      contradictions: [],
    };
  }
}

function threadKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Dedupe case-insensitively, keeping the most recent occurrence's position. */
function dedupeKeepLatest(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = values.length - 1; i >= 0; i--) {
    const key = threadKey(values[i]);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(values[i]);
  }
  return out.reverse();
}

/** Drop threads the section resolved, add the ones it opened, keep the newest. */
export function mergeThreads(
  existing: unknown,
  update: Pick<SectionUpdate, "openThreads" | "resolvedThreads">,
  limit: number
): string[] {
  const resolved = new Set(update.resolvedThreads.map(threadKey));
  const kept = asStringArray(existing).filter((t) => !resolved.has(threadKey(t)));
  return dedupeKeepLatest([...kept, ...update.openThreads]).slice(-limit);
}

export type ChapterStateValues = {
  summary: string | null;
  charactersPresent: unknown;
  location: string | null;
  events: unknown;
  newFacts: unknown;
  openThreads: unknown;
};

export function mergeChapterState(
  prev: ChapterStateValues | null | undefined,
  update: SectionUpdate
) {
  const summary = [prev?.summary, update.sectionSummary].filter(Boolean).join(" ");
  return {
    // Keep the newest notes; the full chapter is re-summarized when it completes.
    summary: tailText(summary, 2400),
    charactersPresent: dedupeKeepLatest([
      ...asStringArray(prev?.charactersPresent),
      ...update.charactersPresent,
    ]).slice(-20),
    location: update.location ?? prev?.location ?? null,
    events: [...asStringArray(prev?.events), ...update.events].slice(-20),
    newFacts: [
      ...asStringArray(prev?.newFacts),
      ...update.newFacts.map((f) => `${f.subject} ${f.predicate} ${f.object}`),
    ].slice(-24),
    openThreads: mergeThreads(prev?.openThreads, update, 16),
  };
}

export function buildChapterSummaryMessages(
  chapter: { number: number; title: string },
  sectionSummaries: string[]
): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "You write continuity notes for a book in progress. Summarize the chapter in 90–140 words of plain prose: the key events or ideas in order, what changed (for the characters, the situation, or the reader's understanding), and exactly how the chapter ends. No preamble, no headings.",
    },
    {
      role: "user",
      content: `Chapter ${chapter.number}: "${chapter.title}"

Section notes, in order:
${sectionSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    },
  ];
}

export function cleanChapterSummary(raw: string): string {
  return clipText(
    stripReasoning(raw).replace(/^(chapter\s+)?summary\s*:\s*/i, "").trim(),
    1400
  );
}

/** Deterministic chapter summary when the summarizer call fails. */
export function fallbackChapterSummary(sectionSummaries: string[]): string {
  return clipText(
    sectionSummaries
      .filter(Boolean)
      .map((s) => firstSentences(s, 320))
      .join(" "),
    1500
  );
}

/**
 * Prior chapters for the writer: the two most recent in full, older ones
 * compressed, oldest dropped first when over budget.
 */
export function composeStorySoFar(
  chapters: Array<{ number: number; title: string; summary: string | null }>,
  budgetChars: number
): string {
  const lines: string[] = [];
  let used = 0;
  for (let i = chapters.length - 1; i >= 0; i--) {
    const chapter = chapters[i];
    const recent = chapters.length - 1 - i < 2;
    const body = recent
      ? clipText(chapter.summary, 1000)
      : firstSentences(chapter.summary, 220);
    const line = `Ch ${chapter.number} "${chapter.title}": ${body || "(no summary)"}`;
    if (used + line.length > budgetChars && lines.length > 0) {
      lines.push(`(Chapters 1–${chapter.number} omitted for length.)`);
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  return lines.reverse().join("\n");
}
