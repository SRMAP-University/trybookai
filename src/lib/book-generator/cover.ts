import { db } from "@/lib/db";
import { cleanEnv } from "@/lib/env";
import { getAppUrl } from "@/lib/book-public";
import { canUploadCoversToR2, uploadCoverToR2 } from "@/lib/r2";

/** Fast Flux text-to-image on Cloudflare Workers AI */
export const FLUX_COVER_MODEL = "@cf/black-forest-labs/flux-1-schnell";

/** Fallback when Flux rejects input or is unavailable */
export const SDXL_LIGHTNING_MODEL =
  "@cf/bytedance/stable-diffusion-xl-lightning";

export const DREAMSHAPER_MODEL = "@cf/lykon/dreamshaper-8";

type BookForCover = {
  id: string;
  slug: string;
  title: string;
  genre: string | null;
  tone: string | null;
  description: string | null;
  outline: unknown;
};

type CloudflareImageResponse = {
  success?: boolean;
  result?: { image?: string } | string;
  errors?: { message?: string; code?: number }[];
};

function outlineSynopsis(outline: unknown): string {
  if (!outline || typeof outline !== "object") return "";
  const synopsis = (outline as { synopsis?: string }).synopsis;
  return synopsis?.trim() ?? "";
}

/** Flux/SDXL require a clean 1–2048 char prompt. */
export function sanitizeCoverPrompt(text: string): string {
  const cleaned = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "Professional book cover illustration, atmospheric scene, no text";
  }

  return cleaned.slice(0, 2048);
}

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
      `Professional book cover art for ${title}.`,
      `Genre: ${genre}. Mood: ${tone}.`,
      `Theme: ${synopsis}.`,
      "Vertical portrait book jacket composition.",
      "Cinematic lighting, detailed focal subject, atmospheric background.",
      "No text, no letters, no words, no typography, no watermarks.",
      "High quality illustrated cover art.",
    ].join(" ")
  );
}

function extractImageBase64(data: CloudflareImageResponse): string | null {
  const result = data.result;
  if (!result) return null;
  if (typeof result === "object" && typeof result.image === "string") {
    return result.image;
  }
  if (typeof result === "string") return result;
  return null;
}

function isImageBytes(buffer: Buffer): boolean {
  return (
    (buffer.length > 2 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff) ||
    (buffer.length > 3 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47)
  );
}

function parseCloudflareImageResponse(buffer: Buffer): Buffer {
  const content = buffer.toString("utf8");

  let data: CloudflareImageResponse;
  try {
    data = JSON.parse(content) as CloudflareImageResponse;
  } catch {
    throw new Error("Image model returned an unparseable response.");
  }

  if (data.success === false) {
    const message =
      data.errors?.[0]?.message ?? "Cover image generation failed.";
    throw new Error(message);
  }

  const image = extractImageBase64(data);
  if (!image) {
    throw new Error("Image model returned an empty cover image.");
  }

  return Buffer.from(image, "base64");
}

async function runCloudflareImageModel(
  model: string,
  body: Record<string, unknown>
): Promise<Buffer> {
  const accountId = cleanEnv(process.env.CLOUDFLARE_ACCOUNT_ID);
  const apiToken = cleanEnv(process.env.CLOUDFLARE_API_TOKEN);

  if (!accountId || !apiToken) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set for cover generation."
    );
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "";

  if (!res.ok) {
    if (contentType.includes("json") || buffer[0] === 0x7b) {
      try {
        const data = JSON.parse(buffer.toString("utf8")) as CloudflareImageResponse;
        throw new Error(
          data.errors?.[0]?.message ??
            `Cover image generation failed (${res.status})`
        );
      } catch (error) {
        if (error instanceof Error && /AiError|invalid input/i.test(error.message)) {
          throw error;
        }
      }
    }
    throw new Error(`Cover image generation failed (${res.status})`);
  }

  // SDXL and some models return raw JPEG/PNG bytes instead of JSON.
  if (contentType.includes("image/") || isImageBytes(buffer)) {
    return buffer;
  }

  return parseCloudflareImageResponse(buffer);
}

export async function runFluxCoverImage(prompt: string): Promise<Buffer> {
  const sanitized = sanitizeCoverPrompt(prompt);

  // Flux Schnell currently returns "Invalid input" for most prompts on this
  // account — skip it and use SDXL Lightning first (returns raw JPEG).
  const attempts: Array<{ model: string; body: Record<string, unknown> }> = [
    {
      model: SDXL_LIGHTNING_MODEL,
      body: {
        prompt: sanitized,
        num_steps: 4,
        width: 768,
        height: 1024,
        guidance: 7.5,
        negative_prompt:
          "text, words, letters, typography, watermark, logo, blurry",
      },
    },
    {
      model: DREAMSHAPER_MODEL,
      body: {
        prompt: sanitized,
        num_steps: 4,
        width: 768,
        height: 1024,
        guidance: 7.5,
        negative_prompt: "text, words, letters, typography, watermark",
      },
    },
    { model: FLUX_COVER_MODEL, body: { prompt: sanitized } },
  ];

  let lastError: Error | null = null;

  for (const attempt of attempts) {
    try {
      return await runCloudflareImageModel(attempt.model, attempt.body);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[cover] ${attempt.model} failed:`, lastError.message);
    }
  }

  throw lastError ?? new Error("Cover image generation failed.");
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
