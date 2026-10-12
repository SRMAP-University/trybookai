/**
 * Drafting loop for one section: write, extend when short, repair cut-offs,
 * and optionally revise against continuity conflicts.
 */

import { proseMaxTokens } from "./sizing";
import {
  cleanSectionOutput,
  countWords,
  endsCleanly,
  lengthPhrase,
  removeLeadingOverlap,
  trimIncompleteEnding,
} from "./text";
import type { ChatMessage, LlmCall } from "./types";

/** Below this share of the target a section gets a continuation pass. */
const MIN_LENGTH_RATIO = 0.8;
const MAX_CONTINUATIONS = 2;
/** A revision shorter than this share of the draft is discarded. */
const MIN_REVISION_RATIO = 0.85;

type Titles = { sectionTitle: string; chapterTitle: string };

function continuationMessages(
  messages: ChatMessage[],
  draft: string,
  remainingWords: number,
  language: string
): ChatMessage[] {
  return [
    ...messages,
    { role: "assistant", content: draft },
    {
      role: "user",
      content: `Continue the section from exactly where your text stops. Write about ${lengthPhrase(remainingWords, language)} more, following the section plan — develop it further rather than wrapping up early — then end the section naturally. Do not repeat or summarize what is already written, and do not add a title or any note.`,
    },
  ];
}

function joinContinuation(draft: string, addition: string): string {
  // Mid-sentence, or a lowercase start: the model carried on in the same paragraph.
  return !endsCleanly(draft) || /^[a-z]/.test(addition)
    ? `${draft} ${addition}`
    : `${draft}\n\n${addition}`;
}

export async function draftSection(params: {
  messages: ChatMessage[];
  targetWords: number;
  language: string;
  temperature: number;
  titles: Titles;
  call: LlmCall;
}): Promise<{ content: string; wordCount: number; calls: number }> {
  const { messages, targetWords, language, temperature, titles, call } = params;
  let calls = 0;

  const write = async (msgs: ChatMessage[], words: number) => {
    calls++;
    return call(msgs, {
      max_tokens: proseMaxTokens(words, language),
      temperature,
      purpose: "prose",
    });
  };

  let result = await write(messages, targetWords);
  let content = cleanSectionOutput(result.text, titles);
  if (!content) {
    result = await write(messages, targetWords);
    content = cleanSectionOutput(result.text, titles);
  }
  if (!content) throw new Error("The model returned an empty section.");
  let truncated = result.truncated;

  for (let pass = 0; pass < MAX_CONTINUATIONS; pass++) {
    if (countWords(content) >= targetWords * MIN_LENGTH_RATIO) break;
    // Continue from a clean sentence boundary, never from half a word.
    if (truncated || !endsCleanly(content)) content = trimIncompleteEnding(content);
    const remaining = Math.max(150, targetWords - countWords(content));
    const next = await write(
      continuationMessages(messages, content, remaining, language),
      Math.max(remaining, 300)
    );
    const addition = removeLeadingOverlap(content, cleanSectionOutput(next.text, titles));
    if (countWords(addition) < 40) break;
    content = joinContinuation(content, addition);
    truncated = next.truncated;
  }

  if (truncated || !endsCleanly(content)) content = trimIncompleteEnding(content);
  return { content, wordCount: countWords(content), calls };
}

/** Rewrite a draft to fix continuity conflicts; null when the revision isn't usable. */
export async function reviseForContinuity(params: {
  messages: ChatMessage[];
  draft: string;
  contradictions: string[];
  language: string;
  temperature: number;
  titles: Titles;
  call: LlmCall;
}): Promise<string | null> {
  const words = countWords(params.draft);
  const result = await params.call(
    [
      ...params.messages,
      { role: "assistant", content: params.draft },
      {
        role: "user",
        content: `A continuity check found conflicts with established facts:
${params.contradictions.map((c) => `- ${c}`).join("\n")}

Rewrite the section to fix only these conflicts. Keep everything else — events, structure, voice and length (about ${lengthPhrase(words, params.language)}) — the same. Output the complete revised section only.`,
      },
    ],
    {
      max_tokens: proseMaxTokens(words, params.language),
      temperature: Math.min(0.5, params.temperature),
      purpose: "prose",
    }
  );
  let revised = cleanSectionOutput(result.text, params.titles);
  if (result.truncated || !endsCleanly(revised)) revised = trimIncompleteEnding(revised);
  return countWords(revised) >= words * MIN_REVISION_RATIO ? revised : null;
}
