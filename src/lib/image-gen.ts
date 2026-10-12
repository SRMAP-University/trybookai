import { cleanEnv } from "@/lib/env";

/** Highest-quality Flux.2 on Cloudflare Workers AI (multipart API) */
export const FLUX2_DEV_MODEL = "@cf/black-forest-labs/flux-2-dev";

/** Fast Flux.2 distilled — still far above Schnell / SDXL Lightning */
export const FLUX2_KLEIN_9B_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";

/** Legacy Flux.1 — kept as a last Flux fallback */
export const FLUX_SCHNELL_MODEL = "@cf/black-forest-labs/flux-1-schnell";

/** Fallback when Flux.2 is unavailable */
export const SDXL_LIGHTNING_MODEL =
  "@cf/bytedance/stable-diffusion-xl-lightning";

export const DREAMSHAPER_MODEL = "@cf/lykon/dreamshaper-8";

type CloudflareImageResponse = {
  success?: boolean;
  result?: { image?: string } | string;
  errors?: { message?: string; code?: number }[];
};

export type ImageSize = { width: number; height: number };

/** Flux/SDXL require a clean 1–2048 char prompt. */
export function sanitizeImagePrompt(text: string, fallback: string): string {
  const cleaned = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (cleaned || fallback).slice(0, 2048);
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
    const message = data.errors?.[0]?.message ?? "Image generation failed.";
    throw new Error(message);
  }

  const image = extractImageBase64(data);
  if (!image) {
    throw new Error("Image model returned an empty image.");
  }

  return Buffer.from(image, "base64");
}

function cloudflareAiCredentials() {
  const accountId = cleanEnv(process.env.CLOUDFLARE_ACCOUNT_ID);
  const apiToken = cleanEnv(process.env.CLOUDFLARE_API_TOKEN);

  if (!accountId || !apiToken) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set for image generation."
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
          data.errors?.[0]?.message ?? `Image generation failed (${status})`
        );
      } catch (error) {
        if (error instanceof SyntaxError) {
          /* fall through to generic status */
        } else {
          throw error;
        }
      }
    }
    throw new Error(`Image generation failed (${status})`);
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

type Attempt =
  | { model: string; mode: "multipart"; fields: Record<string, string> }
  | { model: string; mode: "json"; body: Record<string, unknown> };

/**
 * Generate one image with Flux.2 on Workers AI, falling back through Flux.2
 * klein, SDXL Lightning, DreamShaper and Flux.1 Schnell. `negativePrompt` is
 * passed to the models that accept one. Sizes must be multiples of 16.
 */
export async function runFluxImage(
  prompt: string,
  options: ImageSize & { negativePrompt?: string; label?: string }
): Promise<Buffer> {
  const { width, height, negativePrompt, label = "image" } = options;
  const size = { width: String(width), height: String(height) };

  const attempts: Attempt[] = [
    {
      model: FLUX2_DEV_MODEL,
      mode: "multipart",
      fields: { prompt, ...size, guidance: "3.5", steps: "20" },
    },
    {
      model: FLUX2_DEV_MODEL,
      mode: "multipart",
      fields: { prompt, ...size, guidance: "3.5" },
    },
    {
      model: FLUX2_KLEIN_9B_MODEL,
      mode: "multipart",
      fields: { prompt, ...size, guidance: "4" },
    },
    {
      model: SDXL_LIGHTNING_MODEL,
      mode: "json",
      body: {
        prompt,
        num_steps: 8,
        width,
        height,
        guidance: 7.5,
        ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
      },
    },
    {
      model: DREAMSHAPER_MODEL,
      mode: "json",
      body: {
        prompt,
        num_steps: 8,
        width,
        height,
        guidance: 7.5,
        ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
      },
    },
    { model: FLUX_SCHNELL_MODEL, mode: "json", body: { prompt } },
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
      console.warn(`[${label}] ${attempt.model} failed:`, lastError.message);
    }
  }

  throw lastError ?? new Error("Image generation failed.");
}
