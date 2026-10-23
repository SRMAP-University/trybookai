import { getBaseUrl } from "@/lib/url";

/** The secret internal routes accept (any of the configured ones). */
export function internalSecret(): string | null {
  return (
    process.env.GENERATION_WORKER_SECRET ||
    process.env.CRON_SECRET ||
    process.env.INTERNAL_PUSH_SECRET ||
    null
  );
}

/** True when an internal route's Bearer token matches a configured secret. */
export function isInternalRequest(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;
  return [
    process.env.GENERATION_WORKER_SECRET,
    process.env.CRON_SECRET,
    process.env.INTERNAL_PUSH_SECRET,
  ]
    .filter(Boolean)
    .some((secret) => secret === token);
}

/**
 * POST to one of this app's internal routes, e.g. to carry on a long job in a
 * fresh function before this one hits its time limit. Redirects (apex to www)
 * are followed by hand, because fetch drops the Authorization header on a
 * cross-host redirect. Resolves once the route has accepted the request.
 */
export async function postInternal(path: string, body: unknown): Promise<boolean> {
  const secret = internalSecret();
  if (!secret) {
    console.warn(`[internal] no internal secret set; can't call ${path}`);
    return false;
  }
  let url = `${getBaseUrl()}${path}`;
  const origin = new URL(url).hostname.replace(/^www\./, "");
  for (let hop = 0; hop < 3; hop += 1) {
    const res = await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      const next = new URL(location, url);
      if (next.protocol !== "https:" && process.env.NODE_ENV === "production") return false;
      if (!next.hostname.replace(/^www\./, "").endsWith(origin)) return false;
      url = next.toString();
      continue;
    }
    if (!res.ok) console.warn(`[internal] ${path} answered ${res.status}`);
    return res.ok;
  }
  return false;
}
