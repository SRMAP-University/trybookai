import type { Env } from "../env";
import type { Sql } from "./db";

/**
 * Ask the Next.js app to generate + persist a cover (Workers AI + R2 live there).
 * Failures are logged and swallowed so prose generation can continue.
 */
export async function ensureBookCover(
  sql: Sql,
  env: Env,
  bookId: string,
  options?: { force?: boolean }
): Promise<{ coverImage: string | null; skipped?: boolean; error?: string }> {
  if (!options?.force) {
    const existing = await sql<{ coverImage: string | null }[]>`
      SELECT "coverImage" FROM "Book" WHERE id = ${bookId} LIMIT 1
    `;
    if (existing[0]?.coverImage) {
      return { coverImage: existing[0].coverImage, skipped: true };
    }
  }

  const base = (env.APP_NOTIFY_URL || "https://www.trybookai.com").replace(
    /\/$/,
    ""
  );
  if (!env.GENERATION_WORKER_SECRET) {
    return {
      coverImage: null,
      error: "GENERATION_WORKER_SECRET not set",
    };
  }

  try {
    const res = await fetch(`${base}/api/internal/cover`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GENERATION_WORKER_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bookId,
        force: options?.force ?? false,
      }),
    });

    const text = await res.text();
    let data: {
      coverImage?: string;
      skipped?: boolean;
      error?: string;
    } = {};
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      /* non-JSON body */
    }

    if (!res.ok) {
      const message =
        data.error || `Cover endpoint failed (${res.status}): ${text.slice(0, 200)}`;
      console.warn(`[cover] ${bookId}:`, message);
      return { coverImage: null, error: message };
    }

    return {
      coverImage: data.coverImage ?? null,
      skipped: data.skipped,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[cover] request error for ${bookId}:`, message);
    return { coverImage: null, error: message };
  }
}
