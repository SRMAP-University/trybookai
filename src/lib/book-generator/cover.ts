import { db } from "@/lib/db";
import { cleanEnv } from "@/lib/env";
import { getAppUrl } from "@/lib/book-public";
import { canUploadCoversToR2, uploadCoverToR2 } from "@/lib/r2";

/** Highest-quality Flux.2 on Cloudflare Workers AI (multipart API) */
export const FLUX2_DEV_MODEL = "@cf/black-forest-labs/flux-2-dev";

/** Fast Flux.2 distilled — still far above Schnell / SDXL Lightning */
export const FLUX2_KLEIN_9B_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";

/** Legacy Flux.1 — kept as a last Flux fallback */
export const FLUX_COVER_MODEL = "@cf/black-forest-labs/flux-1-schnell";

/** Fallback when Flux.2 is unavailable */
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
    return "Full-bleed flat book-cover artwork, atmospheric scene filling the frame, no text, no physical book object";
  }

  return cleaned.slice(0, 2048);
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

function cloudflareAiCredentials() {
  const accountId = cleanEnv(process.env.CLOUDFLARE_ACCOUNT_ID);
  const apiToken = cleanEnv(process.env.CLOUDFLARE_API_TOKEN);

  if (!accountId || !apiToken) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set for cover generation."
    );
  }

  return {
    url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`,
    apiToken,
  };
}

function decodeImageResponse(
  buffer: Buffer,
  contentType: string,
  status: number,
  ok: boolean
): Buffer {
  if (!ok) {
    if (contentType.includes("json") || buffer[0] === 0x7b) {
      try {
        const data = JSON.parse(buffer.toString("utf8")) as CloudflareImageResponse;
        throw new Error(
          data.errors?.[0]?.message ??
            `Cover image generation failed (${status})`
        );
      } catch (error) {
        if (error instanceof SyntaxError) {
          /* fall through to generic status */
        } else {
          throw error;
        }
      }
    }
    throw new Error(`Cover image generation failed (${status})`);
  }

  if (contentType.includes("image/") || isImageBytes(buffer)) {
    return buffer;
  }

  return parseCloudflareImageResponse(buffer);
}

async function runCloudflareImageMultipart(
  model: string,
  fields: Record<string, string>
): Promise<Buffer> {
  const { url, apiToken } = cloudflareAiCredentials();
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }

  const res = await fetch(`${url}/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}` },
    body: form,
  });

  const buffer = Buffer.from(await res.arrayBuffer());
  return decodeImageResponse(
    buffer,
    res.headers.get("content-type") ?? "",
    res.status,
    res.ok
  );
}

async function runCloudflareImageModel(
  model: string,
  body: Record<string, unknown>
): Promise<Buffer> {
  const { url, apiToken } = cloudflareAiCredentials();

  const res = await fetch(`${url}/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const buffer = Buffer.from(await res.arrayBuffer());
  return decodeImageResponse(
    buffer,
    res.headers.get("content-type") ?? "",
    res.status,
    res.ok
  );
}

export async function runFluxCoverImage(prompt: string): Promise<Buffer> {
  const sanitized = sanitizeCoverPrompt(prompt);
  const portrait = { width: "768", height: "1024" };

  const attempts: Array<
    | {
        model: string;
        mode: "multipart";
        fields: Record<string, string>;
      }
    | {
        model: string;
        mode: "json";
        body: Record<string, unknown>;
      }
  > = [
    {
      model: FLUX2_DEV_MODEL,
      mode: "multipart",
      fields: {
        prompt: sanitized,
        ...portrait,
        guidance: "3.5",
        steps: "20",
      },
    },
    {
      model: FLUX2_DEV_MODEL,
      mode: "multipart",
      fields: {
        prompt: sanitized,
        ...portrait,
        guidance: "3.5",
      },
    },
    {
      model: FLUX2_KLEIN_9B_MODEL,
      mode: "multipart",
      fields: {
        prompt: sanitized,
        ...portrait,
        guidance: "4",
      },
    },
    {
      model: SDXL_LIGHTNING_MODEL,
      mode: "json",
      body: {
        prompt: sanitized,
        num_steps: 8,
        width: 768,
        height: 1024,
        guidance: 7.5,
        negative_prompt: COVER_NEGATIVE_PROMPT,
      },
    },
    {
      model: DREAMSHAPER_MODEL,
      mode: "json",
      body: {
        prompt: sanitized,
        num_steps: 8,
        width: 768,
        height: 1024,
        guidance: 7.5,
        negative_prompt: COVER_NEGATIVE_PROMPT,
      },
    },
    { model: FLUX_COVER_MODEL, mode: "json", body: { prompt: sanitized } },
  ];

  let lastError: Error | null = null;

  for (const attempt of attempts) {
    try {
      if (attempt.mode === "multipart") {
        return await runCloudflareImageMultipart(attempt.model, attempt.fields);
      }
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
