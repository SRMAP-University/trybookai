import type { ScoreMood } from "@/lib/audio-generator/score-types";
import { runFluxImage, sanitizeImagePrompt } from "@/lib/image-gen";
import { uploadReelFileToR2 } from "@/lib/r2";
import { appearanceOnly, type VisualBible } from "@/lib/reel-generator/cast";

/** 9:16, multiples of 16 for Flux. */
export const REEL_IMAGE_SIZE = { width: 720, height: 1280 } as const;

const MOOD_LIGHTING: Record<ScoreMood, string> = {
  suspense: "low-key lighting, deep shadows, cold rim light",
  action: "dynamic angle, motion blur at the edges, high contrast light",
  dark: "dim, desaturated, heavy shadows, ominous atmosphere",
  mystery: "cool moonlit tones, mist, a single soft light source",
  calm: "soft diffused daylight, gentle colors, still air",
  warm: "golden hour light, warm tones, soft glow",
  sad: "overcast light, muted blue-grey palette, quiet stillness",
  wonder: "luminous glowing light, vast sense of scale, sparkling atmosphere",
  triumph: "bright rising light, sunbeams, heroic low angle",
  neutral: "natural balanced lighting, clear composition",
};

const FRAME_RULES =
  "vertical 9:16 composition, main subject in the upper two-thirds, uncluttered lower third, no text, no letters, no captions, no signs with writing, no watermark, no border";

export const REEL_NEGATIVE_PROMPT = [
  "text",
  "words",
  "letters",
  "captions",
  "subtitles",
  "watermark",
  "logo",
  "signature",
  "border",
  "frame",
  "collage",
  "split screen",
  "UI",
  "blurry",
  "deformed hands",
  "extra fingers",
].join(", ");

function castLines(bible: VisualBible, names: string[], description: string): string[] {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  const lower = description.toLowerCase();
  return bible.cast
    .filter((c) => wanted.has(c.name.toLowerCase()) || lower.includes(c.name.toLowerCase()))
    .slice(0, 3)
    .map((c) => `${c.name}: ${appearanceOnly(c.look)}`);
}

function placeLine(bible: VisualBible, description: string): string | null {
  const lower = description.toLowerCase();
  const place = bible.places.find((p) => lower.includes(p.name.toLowerCase()));
  // A trailing "— Elias sits at the table" would put people into every shot of the place.
  return place ? `${place.name}: ${place.look.replace(/\s+[—–]\s+.*$/, "")}` : null;
}

/**
 * Image models render requested lettering as garbled text, so quoted words a
 * description asks to show ("lettering reads 'For Distinguished…'") become
 * "illegible".
 */
export function withoutLettering(description: string): string {
  return description
    .replace(
      /\b(reads|reading|says|saying|labeled|labelled|titled|inscribed|engraved|spelling)\b[:\s]*["“'‘][^"”'’]{1,120}["”'’]?/gi,
      "$1 illegible"
    )
    .replace(/["“][^"”]{1,120}["”]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buildShotPrompt(
  bible: VisualBible,
  shot: { description: string; characters: string[]; mood: ScoreMood }
): string {
  // Style and look lead every prompt and never change within a reel, so the
  // pictures read as one film; the shot description carries the variety.
  const parts = [
    bible.style,
    bible.look,
    withoutLettering(shot.description),
    ...castLines(bible, shot.characters, shot.description),
    placeLine(bible, shot.description),
    MOOD_LIGHTING[shot.mood],
    FRAME_RULES,
  ].filter(Boolean);
  return sanitizeImagePrompt(parts.join(". "), `${bible.style}. ${FRAME_RULES}`);
}

/** A gentler prompt for a shot the model refused: the setting and mood, no action. */
export function buildSafeShotPrompt(
  bible: VisualBible,
  shot: { description: string; mood: ScoreMood }
): string {
  const place = placeLine(bible, shot.description);
  return sanitizeImagePrompt(
    [
      bible.style,
      bible.look,
      `atmospheric establishing shot${place ? ` of ${place}` : " of the story's setting"}, no people in focus`,
      MOOD_LIGHTING[shot.mood],
      FRAME_RULES,
    ]
      .filter(Boolean)
      .join(". "),
    `${bible.style}. ${FRAME_RULES}`
  );
}

function imageType(bytes: Buffer): { ext: string; contentType: string } {
  const png = bytes.length > 3 && bytes[0] === 0x89 && bytes[1] === 0x50;
  return png
    ? { ext: "png", contentType: "image/png" }
    : { ext: "jpg", contentType: "image/jpeg" };
}

/** Draw one shot and store it; each version gets its own file name. */
export async function drawShotImage(params: {
  bookId: string;
  reelId: string;
  episodeNumber: number;
  shotNumber: number;
  prompt: string;
}): Promise<string> {
  const bytes = await runFluxImage(params.prompt, {
    ...REEL_IMAGE_SIZE,
    negativePrompt: REEL_NEGATIVE_PROMPT,
    label: "reel",
  });
  const { ext, contentType } = imageType(bytes);
  const ep = String(params.episodeNumber).padStart(3, "0");
  const shot = String(params.shotNumber).padStart(2, "0");
  const version = Date.now().toString(36);
  return uploadReelFileToR2(
    params.bookId,
    params.reelId,
    `ep-${ep}/shot-${shot}-${version}.${ext}`,
    bytes,
    contentType
  );
}
