/**
 * Enqueue book generation on the Cloudflare Workflows worker.
 * Vercel only creates the DB job row; CF owns the long-running write loop.
 */

export type EnqueueGenerationPayload = {
  bookId: string;
  userId: string;
  jobId: string;
  /** Restart a hung workflow instance for this job. */
  force?: boolean;
};

export function getGenerationRunner(): "cloudflare" | "local" {
  const explicit = process.env.GENERATION_RUNNER?.trim().toLowerCase();
  if (explicit === "cloudflare" || explicit === "local") return explicit;
  if (process.env.GENERATION_WORKER_URL?.trim()) return "cloudflare";
  return "local";
}

export type EnqueueGenerationResult = {
  instanceId?: string;
  restarted?: boolean;
  alreadyRunning?: boolean;
};

export async function enqueueCloudflareGeneration(
  payload: EnqueueGenerationPayload
): Promise<EnqueueGenerationResult> {
  const base = process.env.GENERATION_WORKER_URL?.replace(/\/$/, "");
  const secret = process.env.GENERATION_WORKER_SECRET;

  if (!base) {
    throw new Error(
      "GENERATION_WORKER_URL is not set (required when GENERATION_RUNNER=cloudflare)."
    );
  }
  if (!secret) {
    throw new Error(
      "GENERATION_WORKER_SECRET is not set (required when GENERATION_RUNNER=cloudflare)."
    );
  }

  const res = await fetch(`${base}/enqueue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Cloudflare generation enqueue failed (${res.status}): ${text.slice(0, 300)}`
    );
  }

  try {
    return (await res.json()) as EnqueueGenerationResult;
  } catch {
    return {};
  }
}
