import { DEFAULT_AI_MODEL } from "@/lib/ai-models";
import { SCORE_MOODS, type ScoreMood } from "@/lib/audio-generator/score-types";
import { createChatCompletion } from "@/lib/book-generator/llm";
import { clipText, languageName, parseJsonLoose } from "@/lib/book-generator/core/text";
import { proseParagraphs } from "@/lib/book-illustrations/place";
import type { VisualBible } from "@/lib/reel-generator/cast";

export type PlannedPicture = {
  description: string;
  caption: string;
  characters: string[];
  mood: ScoreMood;
};

export type PlannedScene = PlannedPicture & { sectionId: string; paragraphIndex: number };

export type ChapterPlan = { opener: PlannedPicture | null; scenes: PlannedScene[] };

type PlanBook = {
  title: string;
  genre: string | null;
  tone: string | null;
  language: string | null;
  narrative: boolean;
};

type PlanChapter = {
  number: number;
  title: string;
  summary: string | null;
  sections: { id: string; number: number; content: string | null }[];
};

/** Text sent to the planner; long chapters get shorter paragraph excerpts. */
const LISTING_BUDGET = 11_000;

type Candidate = { id: string; sectionId: string; paragraphIndex: number; text: string; order: number };

function candidates(chapter: PlanChapter): Candidate[] {
  const out: Candidate[] = [];
  for (const section of chapter.sections) {
    proseParagraphs(section.content).forEach((text, paragraphIndex) => {
      out.push({
        id: `S${section.number}P${paragraphIndex + 1}`,
        sectionId: section.id,
        paragraphIndex,
        text,
        order: out.length,
      });
    });
  }
  return out;
}

/** How many scene pictures a chapter of this many prose paragraphs can carry. */
export function scenesFor(paragraphs: number, wanted: number): number {
  if (paragraphs < 3) return 0;
  if (paragraphs < 7) return Math.min(wanted, 1);
  return wanted;
}

function asMood(value: unknown): ScoreMood {
  return SCORE_MOODS.includes(value as ScoreMood) ? (value as ScoreMood) : "neutral";
}

function asPicture(value: unknown, castNames: Set<string>): PlannedPicture | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const description = String(v.description ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
  if (description.length < 12) return null;
  const characters = Array.isArray(v.characters)
    ? v.characters.map((c) => String(c).trim()).filter((c) => castNames.has(c.toLowerCase()))
    : [];
  return {
    description,
    caption: String(v.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
    characters: [...new Set(characters)].slice(0, 3),
    mood: asMood(v.mood),
  };
}

/** A plain opener from the chapter title and summary when the planner fails. */
function fallbackOpener(chapter: PlanChapter): PlannedPicture {
  const summary = clipText(chapter.summary ?? "", 220);
  return {
    description: `Establishing wide shot of the setting of "${chapter.title}"${summary ? `: ${summary}` : ""}`,
    caption: "",
    characters: [],
    mood: "neutral",
  };
}

/**
 * Pick a chapter's pictures: an establishing opener and up to `sceneCount`
 * key moments, each tied to the prose paragraph it illustrates.
 */
export async function planChapterIllustrations(input: {
  book: PlanBook;
  chapter: PlanChapter;
  bible: VisualBible;
  wantOpener: boolean;
  sceneCount: number;
}): Promise<ChapterPlan> {
  const { book, chapter, bible, wantOpener } = input;
  const pool = candidates(chapter);
  const sceneCount = scenesFor(pool.length, input.sceneCount);
  if (!wantOpener && sceneCount === 0) return { opener: null, scenes: [] };

  const perParagraph = Math.max(
    90,
    Math.min(320, Math.floor(LISTING_BUDGET / Math.max(pool.length, 1)) - 12)
  );
  const listing = pool.map((c) => `[${c.id}] ${clipText(c.text, perParagraph)}`).join("\n");
  const castNames = new Set(bible.cast.map((c) => c.name.toLowerCase()));
  const language = languageName(book.language);
  const moods = SCORE_MOODS.join(", ");

  const subject = book.narrative
    ? "Pictures are illustrations of the story: real moments a reader would want to see."
    : "Pictures are editorial illustrations of the chapter's ideas: a concrete scene, object or visual metaphor that makes an idea clear. People are generic unless the text names them.";

  try {
    const raw = await createChatCompletion({
      model: DEFAULT_AI_MODEL,
      temperature: 0.4,
      max_tokens: 1400,
      json: true,
      messages: [
        {
          role: "system",
          content: `You are the picture editor for an illustrated edition of a book. Choose the pictures for one chapter. ${subject}

Rules:
- ${wantOpener ? `"opener": one establishing picture for the top of the chapter: its main setting and mood as the chapter begins, with the main character if it fits. Never show what happens at the end of the chapter.` : `"opener": null.`}
- "scenes": exactly ${sceneCount} key moment${sceneCount === 1 ? "" : "s"} from different parts of the chapter, spread far apart and never in its first two paragraphs. "paragraph" is the id of the paragraph the picture shows; it is placed right after that paragraph.
- "description": 20 to 45 words. Only what a camera could see: who is where, doing what, key visible details, time of day and light, and the framing (wide, medium or close-up). Vary the framing between pictures. Use character names exactly as listed. No text, letters, signs or logos, and leave out anything that carries writing (certificates, documents, newspapers, screens, labels) unless it is too far away to read. No gore: show tension, not wounds.
- "caption": at most 12 words in ${language}, an evocative line printed under the picture, like a caption in a novel's illustrated edition. Describe the moment, don't summarize the plot or explain what it means, and give nothing away.
- "characters": names from the cast list who appear in the picture.
- "mood": one of ${moods}.

Return only JSON: {"opener": {"description": string, "caption": string, "characters": [string], "mood": string} | null, "scenes": [{"paragraph": string, "description": string, "caption": string, "characters": [string], "mood": string}]}`,
        },
        {
          role: "user",
          content: [
            `Book: "${book.title}"${book.genre ? ` (${book.genre})` : ""}${book.tone ? `, tone: ${book.tone}` : ""}`,
            bible.cast.length ? `Cast: ${bible.cast.map((c) => c.name).join(", ")}` : "",
            bible.places.length ? `Places: ${bible.places.map((p) => p.name).join(", ")}` : "",
            `Chapter ${chapter.number}: "${chapter.title}"`,
            chapter.summary ? `Summary: ${clipText(chapter.summary, 700)}` : "",
            `Paragraphs:\n${listing}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });

    const parsed = parseJsonLoose(raw) as { opener?: unknown; scenes?: unknown };
    const opener = wantOpener ? asPicture(parsed.opener, castNames) ?? fallbackOpener(chapter) : null;

    const byId = new Map(pool.map((c) => [c.id.toUpperCase(), c]));
    const chosen: { order: number; scene: PlannedScene }[] = [];
    for (const item of Array.isArray(parsed.scenes) ? parsed.scenes : []) {
      const picture = asPicture(item, castNames);
      const ref = String((item as { paragraph?: unknown })?.paragraph ?? "").trim().toUpperCase();
      const candidate = byId.get(ref);
      if (!picture || !candidate || candidate.order < 2) continue;
      // Keep pictures apart so two never land in the same stretch of text.
      if (chosen.some((c) => Math.abs(c.order - candidate.order) < 3)) continue;
      chosen.push({
        order: candidate.order,
        scene: { ...picture, sectionId: candidate.sectionId, paragraphIndex: candidate.paragraphIndex },
      });
      if (chosen.length >= sceneCount) break;
    }
    chosen.sort((a, b) => a.order - b.order);
    return { opener, scenes: chosen.map((c) => c.scene) };
  } catch (error) {
    console.warn(
      `[illustrations] planning chapter ${chapter.number} failed; using a plain opener:`,
      error instanceof Error ? error.message : error
    );
    return { opener: wantOpener ? fallbackOpener(chapter) : null, scenes: [] };
  }
}
