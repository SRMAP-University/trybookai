import { db } from "@/lib/db";
import { getAppUrl } from "@/lib/book-public";
import { canUploadCoversToR2, uploadCoverToR2 } from "@/lib/r2";
import { runFluxImage, sanitizeImagePrompt } from "@/lib/image-gen";

type BookForCover = {
  id: string;
  slug: string;
  title: string;
  genre: string | null;
  tone: string | null;
  description: string | null;
  outline: unknown;
};

function outlineSynopsis(outline: unknown): string {
  if (!outline || typeof outline !== "object") return "";
  const synopsis = (outline as { synopsis?: string }).synopsis;
  return synopsis?.trim() ?? "";
}

/** Flux/SDXL require a clean 1–2048 char prompt. */
export function sanitizeCoverPrompt(text: string): string {
  return sanitizeImagePrompt(
    text,
    "Full-bleed flat book-cover artwork, atmospheric scene filling the frame, no text, no physical book object"
  );
}

/** Shared negatives for models that support negative_prompt. */
export const COVER_NEGATIVE_PROMPT = [
  "text",
  "words",
  "letters",
  "typography",
  "title",
  "watermark",
  "logo",
  "barcode",
  "blurry",
  "physical book",
  "hardcover book object",
  "paperback",
  "book mockup",
  "3d book",
  "book on table",
  "book on shelf",
  "hands holding book",
  "open book",
  "book spine",
  "pages",
  "product photo",
  "photograph of a book",
  "framed picture",
  "border",
  "margin",
  "collage",
  "UI",
  "screenshot",
].join(", ");

export function buildBookCoverPrompt(book: BookForCover): string {
  const title = (book.title?.trim() || "Untitled Book").slice(0, 120);
  const synopsis = sanitizeCoverPrompt(
    outlineSynopsis(book.outline) ||
      book.description?.trim() ||
      "A compelling literary story"
  ).slice(0, 280);

  const genre = (book.genre?.trim() || "fiction").slice(0, 80);
  const tone = (book.tone?.trim() || "dramatic").slice(0, 80);

  return sanitizeCoverPrompt(
    [
      `Flat full-bleed cover artwork inspired by the story "${title}".`,
      `Genre: ${genre}. Mood: ${tone}.`,
      `Scene: ${synopsis}.`,
      "Vertical 3:4 poster illustration that fills the entire image edge to edge.",
      "One striking focal subject, painterly cinematic lighting, rich color, atmospheric depth.",
      "Print-ready flat artwork only — the image IS the cover art, not a photo of a book.",
      "Do not depict a physical book, hardcover, paperback, mockup, shelf, table, hands, spine, or pages.",
      "No text, no letters, no title, no typography, no watermark, no barcode, no borders, no frames.",
    ].join(" ")
  );
}

export async function runFluxCoverImage(prompt: string): Promise<Buffer> {
  return runFluxImage(sanitizeCoverPrompt(prompt), {
    width: 768,
    height: 1024,
    negativePrompt: COVER_NEGATIVE_PROMPT,
    label: "cover",
  });
}

async function persistCoverImage(
  book: BookForCover,
  imageBytes: Buffer
): Promise<string> {
  if (!canUploadCoversToR2()) {
    throw new Error(
      "Cover storage requires R2. Add R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY to .env (Cloudflare → R2 → Manage R2 API Tokens)."
    );
  }

  const { publicUrl } = await uploadCoverToR2(book.id, imageBytes);
  if (publicUrl) return publicUrl;

  return `${getAppUrl()}/api/books/${book.id}/cover-image`;
}

export async function generateAndSaveBookCover(
  bookId: string,
  options?: { force?: boolean }
) {
  const book = await db.book.findUniqueOrThrow({
    where: { id: bookId },
    select: {
      id: true,
      slug: true,
      title: true,
      genre: true,
      tone: true,
      description: true,
      outline: true,
      coverImage: true,
    },
  });

  if (book.coverImage && !options?.force) {
    return { coverImage: book.coverImage, prompt: null };
  }

  const prompt = buildBookCoverPrompt(book);
  const imageBytes = await runFluxCoverImage(prompt);
  const coverImage = await persistCoverImage(book, imageBytes);

  await db.book.update({
    where: { id: bookId },
    data: {
      coverImage,
      coverPrompt: prompt,
    },
  });

  return { coverImage, prompt };
}
