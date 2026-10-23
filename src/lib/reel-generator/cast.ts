import { OUTLINE_AI_MODEL } from "@/lib/ai-models";
import { createChatCompletion } from "@/lib/book-generator/llm";
import { clipText, parseJsonLoose } from "@/lib/book-generator/core/text";
import { isNarrativeBook } from "@/lib/book-generator/core/format";
import { reelStyle } from "@/lib/reel-generator/types";
import type { ReelBook } from "@/lib/reel-generator/script";

/**
 * The look shared by every shot in a reel: the style line plus a short visual
 * descriptor per main character and place. Repeating the same words on every
 * prompt is what keeps a character recognizable from shot to shot.
 */
export type VisualBible = {
  style: string;
  /** One color palette, light quality, lens and texture for the whole reel. */
  look?: string;
  cast: { name: string; look: string }[];
  places: { name: string; look: string }[];
};

type NamedNote = { name: string; note: string };

function bookCharacters(book: ReelBook): NamedNote[] {
  const fromBible = (book.bible?.characters ?? []).map((c) => ({
    name: c.name,
    note: c.profile ?? "",
  }));
  if (fromBible.length) return fromBible;

  // Older books keep characters as JSON on the book row.
  const raw = book.characters;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      if (typeof c === "string") return { name: c, note: "" };
      if (c && typeof c === "object") {
        const obj = c as Record<string, unknown>;
        const name = String(obj.name ?? "").trim();
        const note = String(obj.description ?? obj.role ?? obj.profile ?? "").trim();
        return name ? { name, note } : null;
      }
      return null;
    })
    .filter((c): c is NamedNote => Boolean(c))
    .slice(0, 10);
}

function bookPlaces(book: ReelBook): NamedNote[] {
  return (book.bible?.locations ?? []).map((l) => ({
    name: l.name,
    note: l.description ?? "",
  }));
}

function clean(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * A character's look as appearance and clothing only. Props, actions and
 * expressions ("holding a mug", "— eyes downcast") would otherwise appear in
 * every picture of that character, whatever the shot is about.
 */
export function appearanceOnly(look: string): string {
  return look
    .replace(/\s+[—–-]\s+.*$/, "")
    .replace(/,?\s*\b(holding|carrying|clutching|gripping|wielding|with a|with an)\b[^,.;]*/gi, "")
    .replace(/,?\s*\b(eyes|expression|gaze|smile|frown)\b[^,.;]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,;]+$/, "")
    .trim();
}

export function parseVisualBible(value: unknown): VisualBible | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<VisualBible>;
  if (typeof v.style !== "string") return null;
  return {
    style: v.style,
    look: typeof v.look === "string" ? v.look : undefined,
    cast: Array.isArray(v.cast) ? v.cast : [],
    places: Array.isArray(v.places) ? v.places : [],
  };
}

/**
 * Capitalized words that never appear in lowercase, by frequency: in a story
 * these are almost always the names of its people and places.
 */
export function frequentNames(text: string, limit = 12): string[] {
  const lower = new Set(text.match(/\b[a-z]{3,}\b/g) ?? []);
  const counts = new Map<string, number>();
  for (const word of text.match(/\b[A-Z][a-z]{2,}\b/g) ?? []) {
    if (lower.has(word.toLowerCase())) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, n]) => `${word} (${n})`);
}

/** Chapter summaries, the names the text uses most and its opening pages, for books without a character list. */
function storyExcerpt(book: ReelBook): string {
  const summaries = book.chapters
    .map((c) => c.state?.summary?.trim() || c.summary?.trim() || "")
    .filter(Boolean)
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");
  const fullText = book.chapters
    .flatMap((c) => c.sections.map((s) => s.content ?? ""))
    .join("\n\n");
  const names = frequentNames(fullText);
  const opening = (book.chapters.find((c) => c.sections.some((s) => s.content?.trim()))?.sections ?? [])
    .map((s) => s.content ?? "")
    .join("\n\n");
  return [
    summaries ? `Chapter summaries:\n${clipText(summaries, 1500)}` : "",
    names.length ? `Names used most often in the text (with counts): ${names.join(", ")}` : "",
    opening ? `Story text (opening):\n${clipText(opening, 2000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** A look from the book's tone when the art director call is skipped or fails. */
function fallbackLook(book: ReelBook): string {
  const tone = book.tone?.trim().toLowerCase();
  return `${tone ? `${tone} tone, ` : ""}one consistent color palette and lighting across every shot, coherent production design`;
}

export async function buildVisualBible(
  book: ReelBook,
  styleId: string,
  options: {
    /** A style line to use instead of a reel style preset. */
    stylePrompt?: string;
    /** What the pictures are for, so the art director writes for it. */
    medium?: "video" | "book";
  } = {}
): Promise<VisualBible> {
  const style = options.stylePrompt || reelStyle(styleId).prompt;
  const medium = options.medium ?? "video";
  const narrative = isNarrativeBook(book);
  const characters = narrative ? bookCharacters(book) : [];
  const places = narrative ? bookPlaces(book) : [];
  const empty: VisualBible = { style, look: fallbackLook(book), cast: [], places: [] };

  const outline = book.outline as { synopsis?: string } | null;
  const listing = [
    `Book: "${book.title}"${book.genre ? ` (${book.genre})` : ""}${book.tone ? `, tone: ${book.tone}` : ""}`,
    `Art style: ${style}`,
    `Synopsis: ${clipText(book.storyState?.bookSummary || outline?.synopsis || book.description || "", 1200)}`,
    book.bible?.styleNotes ? `World notes: ${clipText(book.bible.styleNotes, 600)}` : "",
    characters.length
      ? `Characters:\n${characters.map((c) => `- ${c.name}: ${clipText(c.note, 400)}`).join("\n")}`
      : "",
    places.length
      ? `Places:\n${places.map((p) => `- ${p.name}: ${clipText(p.note, 300)}`).join("\n")}`
      : "",
    // Without a character list, the cast has to come from the story itself, or
    // invented names won't match the people the shots and pictures mention.
    narrative && !characters.length ? storyExcerpt(book) : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const raw = await createChatCompletion({
      model: OUTLINE_AI_MODEL,
      temperature: 0.4,
      max_tokens: 1400,
      json: true,
      messages: [
        {
          role: "system",
          content: `${
            medium === "book"
              ? "You are the art director for an illustrated edition of a book. Everything you write is pasted into every image prompt, so the whole book looks like one illustrator drew it and each character looks the same in every picture."
              : "You are the art director for an illustrated video of a book. Everything you write is pasted into every image prompt, so the whole video looks like one film and each character looks the same in every picture."
          }

Rules:
- "look": the visual identity of the whole ${medium} in 25 words or fewer: a specific color palette, light quality, lens or camera feel, and texture, fitting the book's genre, era and tone.
- Characters: 25 words or fewer each. Appearance and clothing only: apparent age, build, face shape, hair, skin tone if the book states it, outfit, and one signature physical or clothing detail. No props or objects held, no actions, no expressions or moods; those change from shot to shot.
- Where the book is silent, invent plausible details that fit the genre and era, and keep them simple.
- Places: 20 words or fewer each. Architecture or landscape, materials, light, one signature detail.
- At most 6 characters and 5 places; pick the most important. ${
            !narrative
              ? "Use empty lists when none are given."
              : characters.length
                ? "Use the names exactly as given."
                : "No character list is given: take the main characters and places from the synopsis and story text, with their names spelled exactly as in the text. Never invent characters who aren't in it."
          }
- If a character is a real, identifiable person, describe only their period clothing and role, never their face.

Return only JSON: {"look": string, "cast": [{"name": string, "look": string}], "places": [{"name": string, "look": string}]}`,
        },
        { role: "user", content: listing },
      ],
    });

    const parsed = parseJsonLoose(raw) as {
      look?: unknown;
      cast?: Array<{ name?: unknown; look?: unknown }>;
      places?: Array<{ name?: unknown; look?: unknown }>;
    };
    const placeList = (parsed.places ?? [])
      .map((p) => ({ name: clean(p.name, 60), look: clean(p.look, 200) }))
      .filter((p) => p.name && p.look)
      .slice(0, 5);
    // A city listed as a "character" would put a person into every picture that mentions it.
    const placeNames = new Set(placeList.map((p) => p.name.toLowerCase()));
    return {
      style,
      look: clean(parsed.look, 240) || empty.look,
      cast: (parsed.cast ?? [])
        .map((c) => ({ name: clean(c.name, 60), look: appearanceOnly(clean(c.look, 220)) }))
        .filter((c) => c.name && c.look && !placeNames.has(c.name.toLowerCase()))
        .slice(0, 6),
      places: placeList,
    };
  } catch (error) {
    console.warn(
      "[reels] cast descriptors failed; shots will rely on the style line:",
      error instanceof Error ? error.message : error
    );
    return empty;
  }
}
