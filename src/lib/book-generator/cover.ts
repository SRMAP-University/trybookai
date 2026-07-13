import { db } from "@/lib/db";
import { getAppUrl } from "@/lib/book-public";
import { canUploadCoversToR2, uploadCoverToR2 } from "@/lib/r2";

/** Fast Flux text-to-image on Cloudflare Workers AI */
export const FLUX_COVER_MODEL = "@cf/black-forest-labs/flux-1-schnell";

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

export function buildBookCoverPrompt(book: BookForCover): string {
  const synopsis =
    outlineSynopsis(book.outline) ||
    book.description?.trim() ||
    "A compelling literary story";

  const genre = book.genre ?? "fiction";
  const tone = book.tone ?? "dramatic";

  return [
    `Professional book cover art for the novel "${book.title}".`,
    `Genre: ${genre}. Mood: ${tone}.`,
    `Story theme: ${synopsis.slice(0, 280)}.`,
    "Vertical portrait composition suitable for a book jacket.",
    "Rich cinematic lighting, detailed focal subject, atmospheric background.",
    "No text, no letters, no words, no typography, no watermarks.",
    "High quality illustrated cover art.",
  ].join(" ");
}

export async function runFluxCoverImage(prompt: string): Promise<Buffer> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set for cover generation."
    );
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${FLUX_COVER_MODEL}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: prompt.slice(0, 2048),
      steps: 4,
    }),
  });

  const data = (await res.json()) as {
    success?: boolean;
    result?: { image?: string };
    errors?: { message?: string }[];
  };

  if (!res.ok || !data.success) {
    const message =
      data.errors?.[0]?.message ??
      `Flux cover generation failed (${res.status})`;
    throw new Error(message);
  }

  const image = data.result?.image;
  if (!image) {
    throw new Error("Flux returned an empty cover image.");
  }

  return Buffer.from(image, "base64");
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

  // Private bucket — serve through the app proxy (bytes live in R2)
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
