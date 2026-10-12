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

export function parseVisualBible(value: unknown): VisualBible | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<VisualBible>;
  if (typeof v.style !== "string") return null;
  return {
    style: v.style,
    cast: Array.isArray(v.cast) ? v.cast : [],
    places: Array.isArray(v.places) ? v.places : [],
  };
}

export async function buildVisualBible(
  book: ReelBook,
  styleId: string
): Promise<VisualBible> {
  const style = reelStyle(styleId).prompt;
  const characters = bookCharacters(book);
  const places = bookPlaces(book);
  const empty: VisualBible = { style, cast: [], places: [] };
  if (!isNarrativeBook(book) || (characters.length === 0 && places.length === 0)) {
    return empty;
  }

  const outline = book.outline as { synopsis?: string } | null;
  const listing = [
    `Book: "${book.title}"${book.genre ? ` (${book.genre})` : ""}`,
    `Synopsis: ${clipText(book.storyState?.bookSummary || outline?.synopsis || book.description || "", 1200)}`,
    book.bible?.styleNotes ? `World notes: ${clipText(book.bible.styleNotes, 600)}` : "",
    characters.length
      ? `Characters:\n${characters.map((c) => `- ${c.name}: ${clipText(c.note, 400)}`).join("\n")}`
      : "",
    places.length
      ? `Places:\n${places.map((p) => `- ${p.name}: ${clipText(p.note, 300)}`).join("\n")}`
      : "",
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
          content: `You are the art director for an illustrated video of a book. Write a fixed visual description for each main character and place, to be pasted into every image prompt so they look the same in every picture.

Rules:
- Characters: 25 words or fewer each. Apparent age, build, hair, skin tone if the book states it, clothing, and one signature detail. Only things a camera can see.
- Where the book is silent, invent plausible details that fit the genre and era, and keep them simple.
- Places: 20 words or fewer each. Architecture or landscape, materials, light, one signature detail.
- At most 6 characters and 5 places; pick the most important.
- If a character is a real, identifiable person, describe only their period clothing and role, never their face.

Return only JSON: {"cast": [{"name": string, "look": string}], "places": [{"name": string, "look": string}]}`,
        },
        { role: "user", content: listing },
      ],
    });

    const parsed = parseJsonLoose(raw) as {
      cast?: Array<{ name?: unknown; look?: unknown }>;
      places?: Array<{ name?: unknown; look?: unknown }>;
    };
    return {
      style,
      cast: (parsed.cast ?? [])
        .map((c) => ({ name: clean(c.name, 60), look: clean(c.look, 220) }))
        .filter((c) => c.name && c.look)
        .slice(0, 6),
      places: (parsed.places ?? [])
        .map((p) => ({ name: clean(p.name, 60), look: clean(p.look, 200) }))
        .filter((p) => p.name && p.look)
        .slice(0, 5),
    };
  } catch (error) {
    console.warn(
      "[reels] cast descriptors failed; shots will rely on the style line:",
      error instanceof Error ? error.message : error
    );
    return empty;
  }
}
