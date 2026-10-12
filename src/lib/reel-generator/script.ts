import { db } from "@/lib/db";
import { DEFAULT_AI_MODEL } from "@/lib/ai-models";
import { createChatCompletion } from "@/lib/book-generator/llm";
import { clipText, languageName } from "@/lib/book-generator/core/text";
import { isNarrativeBook } from "@/lib/book-generator/core/format";
import { markdownToNarration } from "@/lib/audio-generator/narration";

/** Book fields and context every reel stage reads. */
export async function loadReelBook(bookId: string) {
  return db.book.findUniqueOrThrow({
    where: { id: bookId },
    select: {
      id: true,
      title: true,
      genre: true,
      tone: true,
      language: true,
      description: true,
      outline: true,
      templateId: true,
      customInstructions: true,
      includeExamples: true,
      pov: true,
      tense: true,
      characters: true,
      storyState: { select: { bookSummary: true } },
      bible: {
        select: {
          styleNotes: true,
          characters: {
            select: { name: true, profile: true },
            orderBy: { createdAt: "asc" },
            take: 10,
          },
          locations: {
            select: { name: true, description: true },
            orderBy: { createdAt: "asc" },
            take: 8,
          },
        },
      },
      chapters: {
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          title: true,
          summary: true,
          state: { select: { summary: true, location: true, charactersPresent: true } },
          sections: {
            orderBy: { number: "asc" },
            select: { content: true },
          },
        },
      },
    },
  });
}

export type ReelBook = Awaited<ReturnType<typeof loadReelBook>>;
export type ReelChapter = ReelBook["chapters"][number];

export function chapterHasContent(chapter: ReelChapter): boolean {
  return chapter.sections.some((s) => s.content?.trim());
}

function synopsis(book: ReelBook): string {
  const outline = book.outline as { synopsis?: string } | null;
  return (
    book.storyState?.bookSummary?.trim() ||
    outline?.synopsis?.trim() ||
    book.description?.trim() ||
    ""
  );
}

function chapterSummary(chapter: ReelChapter): string {
  return chapter.state?.summary?.trim() || chapter.summary?.trim() || "";
}

/**
 * Normalize a script so character offsets stay stable through narration:
 * paragraphs separated by one blank line, single spaces inside them.
 */
export function normalizeScript(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Cut an over-long script back to the last full sentence under `maxWords`. */
function capWords(script: string, maxWords: number): string {
  const words = script.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return script;
  const sentences = script.match(/[^.!?…]+[.!?…]+["”’)]*\s*/g) ?? [script];
  let out = "";
  let count = 0;
  for (const sentence of sentences) {
    const n = sentence.split(/\s+/).filter(Boolean).length;
    if (count + n > maxWords && out) break;
    out += sentence;
    count += n;
  }
  return normalizeScript(out);
}

function cleanModelScript(raw: string): string {
  const withoutWrappers = raw
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```\s*$/, "")
    .replace(/^\s*(narration|script)\s*:\s*/i, "")
    .trim();
  return normalizeScript(markdownToNarration(withoutWrappers));
}

/**
 * Write the narration for one Short (a chapter) or the trailer (whole book):
 * a hook-first, picture-rich retelling sized to `targetWords`.
 */
export async function writeEpisodeScript(input: {
  book: ReelBook;
  chapter: ReelChapter | null;
  targetWords: number;
}): Promise<string> {
  const { book, chapter, targetWords } = input;
  const narrative = isNarrativeBook(book);
  const language = languageName(book.language);
  const seconds = Math.round((targetWords / 150) * 60);

  const subject = chapter
    ? `chapter ${chapter.number}, "${chapter.title}"`
    : "the whole book, as a trailer";

  const storyRules = narrative
    ? [
        "- Retell what happens, in order, as the story itself: a narrator's voice, not a review or a summary of a book.",
        `- Keep the book's point of view (${book.pov} person) and ${book.tense} tense.`,
        "- Every sentence should suggest a picture: who is where, doing what, what it looks like.",
      ]
    : [
        "- Explain the key idea with one concrete example or scene the viewer can picture.",
        "- Every sentence should suggest a picture: a place, an object, a person doing something.",
      ];

  const endRule = chapter
    ? "- End on a line that lands: a turn, a reveal or a question that makes people want the next part."
    : "- End on a tease or question. Never reveal the ending.";

  const source = chapter
    ? [
        chapterSummary(chapter) && `Chapter summary: ${chapterSummary(chapter)}`,
        `Chapter text:\n${clipText(
          chapter.sections.map((s) => markdownToNarration(s.content)).filter(Boolean).join("\n\n"),
          9000
        )}`,
      ]
    : [
        synopsis(book) && `Book summary: ${clipText(synopsis(book), 2500)}`,
        `Chapters:\n${book.chapters
          .map((c) => `${c.number}. ${c.title}${chapterSummary(c) ? ` — ${clipText(chapterSummary(c), 300)}` : ""}`)
          .join("\n")
          .slice(0, 6000)}`,
      ];

  const raw = await createChatCompletion({
    model: DEFAULT_AI_MODEL,
    temperature: 0.7,
    max_tokens: 1200,
    messages: [
      {
        role: "system",
        content: `You adapt books into short narrated vertical videos for TikTok, Instagram Reels and YouTube Shorts. Write the voice-over for one ${seconds}-second video covering ${subject}.

Rules:
- About ${targetWords} words, never more than ${targetWords + 15}.
- Open with a hook: the first sentence must make someone stop scrolling.
${storyRules.join("\n")}
- Short, spoken sentences. Two to four short paragraphs.
- No headings, lists, markdown, hashtags, emojis, stage directions or calls to action. Never say "in this chapter" or "in this book".
${endRule}
- Write in ${language}.

Return only the narration text.`,
      },
      {
        role: "user",
        content: [
          `Book: "${book.title}"${book.genre ? ` (${book.genre})` : ""}`,
          book.tone ? `Tone: ${book.tone}` : "",
          ...source,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const script = capWords(cleanModelScript(raw), Math.round(targetWords * 1.25));
  if (script.split(/\s+/).filter(Boolean).length < Math.min(40, targetWords / 3)) {
    throw new Error("The writer returned an empty script. Try again.");
  }
  return script;
}
