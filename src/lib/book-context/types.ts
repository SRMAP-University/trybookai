/** Shared types + token budgets for hierarchical book context. */

export const CONTEXT_BUDGETS = {
  core: 1800,
  current: 1800,
  retrieved: 3500,
  immediate: 1800,
} as const;

export type AssembledContext = {
  core: string;
  current: string;
  retrieved: string;
  immediate: string;
  /** Combined user-message block for generation. */
  userPrompt: string;
  /** Approximate token estimate (chars/4). */
  approxTokens: number;
};

export type OutlineChapter = {
  number?: number;
  title?: string;
  summary?: string;
  sections?: Array<{ number?: number; title?: string; summary?: string }>;
};

export type BookOutlineLike = {
  title?: string;
  synopsis?: string;
  chapters?: OutlineChapter[];
};

export type ExtractedSectionUpdate = {
  sectionSummary: string;
  objective?: string;
  charactersPresent: string[];
  location?: string;
  events: string[];
  newFacts: Array<{ subject: string; predicate: string; object: string }>;
  openThreads: string[];
  contradictions: string[];
};

/** Rough token estimate: ~4 chars per token. */
export function approxTokens(text: string): number {
  return Math.ceil((text || "").length / 4);
}

/** Truncate text to an approximate token budget. */
export function clipToBudget(text: string, budgetTokens: number): string {
  if (!text) return "";
  const maxChars = Math.max(0, budgetTokens * 4);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 20).trim()}…`;
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

/** Pull likely proper-name tokens from titles / free text for retrieval. */
export function extractEntityHints(...parts: Array<string | null | undefined>): string[] {
  const hints = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    for (const name of asStringArray(part)) {
      if (name.length >= 2) hints.add(name);
    }
    const matches = part.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g);
    for (const m of matches ?? []) {
      if (m.length >= 2 && m.length < 40) hints.add(m);
    }
  }
  return [...hints].slice(0, 24);
}

export function buildAssembledUserPrompt(parts: {
  core: string;
  current: string;
  retrieved: string;
  immediate: string;
  sectionTitle: string;
  sectionNumber: number;
  sectionsPerChapter: number;
}): AssembledContext {
  const core = clipToBudget(parts.core, CONTEXT_BUDGETS.core);
  const current = clipToBudget(parts.current, CONTEXT_BUDGETS.current);
  const retrieved = clipToBudget(parts.retrieved, CONTEXT_BUDGETS.retrieved);
  const immediate = clipToBudget(parts.immediate, CONTEXT_BUDGETS.immediate);

  const userPrompt = [
    "CORE (style & canon rules):",
    core || "(none)",
    "",
    "CURRENT (chapter / scene state):",
    current || "(none)",
    "",
    "RETRIEVED (relevant characters, places, facts):",
    retrieved || "(none)",
    "",
    "IMMEDIATE (previous scene prose):",
    immediate || "(start of chapter — no prior scene)",
    "",
    `Write section "${parts.sectionTitle}" (Section ${parts.sectionNumber} of ${parts.sectionsPerChapter}).`,
    "Output only the section prose — no headings, no reasoning notes.",
  ].join("\n");

  return {
    core,
    current,
    retrieved,
    immediate,
    userPrompt,
    approxTokens: approxTokens(userPrompt),
  };
}
