/** The "Writing requirements" block shared by outline and section prompts. */

import { resolveContentFormat } from "./format";
import { asStringArray, formatList, isEnglish, languageName } from "./text";

export type StyleSource = {
  genre: string | null;
  description: string | null;
  templateId?: string | null;
  pov: string;
  tense: string;
  language: string;
  tone: string | null;
  audience: string | null;
  style: string | null;
  customInstructions: string | null;
  forbiddenTopics: string | null;
  includeDialogue: boolean;
  includeExamples: boolean;
  characters?: unknown;
  themes?: unknown;
};

export type BibleStyle = {
  styleNotes: string | null;
  worldRules: string | null;
  themes: unknown;
} | null;

const POV_LABELS: Record<string, string> = {
  first: "first person (I / we)",
  second: "second person (you)",
  third: "third person limited",
  omniscient: "third person omniscient",
};

const TENSE_LABELS: Record<string, string> = {
  past: "past tense",
  present: "present tense",
};

function differs(value: string | null | undefined, from: string | null | undefined) {
  return Boolean(value?.trim()) && value!.trim() !== (from ?? "").trim();
}

export function buildStyleBlock(
  book: StyleSource,
  options: { bible?: BibleStyle; includeCast?: boolean } = {}
): string {
  const { bible } = options;
  const language = languageName(book.language);
  const themes = [
    ...new Set([...asStringArray(book.themes), ...asStringArray(bible?.themes)]),
  ];

  const parts: Array<string | null> = [
    `Language: ${language} — write all prose in ${language}.`,
    `Point of view: ${POV_LABELS[book.pov] ?? book.pov}`,
    `Tense: ${TENSE_LABELS[book.tense] ?? book.tense}`,
    `Tone: ${book.tone ?? "professional"}`,
    `Audience: ${book.audience ?? "general readers"}`,
    book.includeDialogue
      ? "Include natural dialogue where appropriate."
      : "Minimize or avoid dialogue.",
    book.includeExamples
      ? "Include concrete examples, frameworks, or case studies where useful."
      : "Prefer narrative or exposition over instructional examples.",
    book.style ? `Style guide: ${book.style}` : null,
    book.customInstructions ? `Custom instructions: ${book.customInstructions}` : null,
    // The bible is seeded from the same fields; only repeat it when it adds something.
    differs(bible?.styleNotes, book.style) ? `Style notes: ${bible!.styleNotes}` : null,
    differs(bible?.worldRules, book.customInstructions)
      ? `World rules: ${bible!.worldRules}`
      : null,
    options.includeCast && book.characters
      ? `Characters / cast: ${formatList(book.characters)}`
      : null,
    themes.length ? `Themes: ${themes.join(", ")}` : null,
    book.forbiddenTopics ? `Avoid these topics: ${book.forbiddenTopics}` : null,
    isEnglish(book.language)
      ? 'Avoid stock phrasing such as "a testament to", "tapestry", "delve into", "in today\'s fast-paced world", "it is important to note", "little did they know", and "a shiver ran down".'
      : null,
    resolveContentFormat({
      genre: book.genre,
      templateId: book.templateId,
      description: book.description,
      customInstructions: book.customInstructions,
      includeExamples: book.includeExamples,
    }).instructions,
  ];

  return parts.filter(Boolean).join("\n");
}
