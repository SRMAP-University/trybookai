import { headers } from "next/headers";
import { db } from "@/lib/db";
import { normalizeCountryCode } from "@/lib/country-display";

export {
  countryName,
  flagEmoji,
  normalizeCountryCode,
} from "@/lib/country-display";

function headerValue(h: Headers, name: string): string | null {
  const raw = h.get(name);
  if (!raw) return null;
  return raw.split(",")[0]?.trim() || null;
}

/**
 * Read ISO country from CDN / platform geo headers.
 * Covers Netlify, Vercel, Cloudflare, CloudFront, and our own proxy header.
 */
export function countryCodeFromHeaders(h: Headers): string | null {
  const candidates = [
    headerValue(h, "x-bookai-country"),
    headerValue(h, "x-nf-country"),
    headerValue(h, "x-country"),
    headerValue(h, "x-country-code"),
    headerValue(h, "cf-ipcountry"),
    headerValue(h, "x-vercel-ip-country"),
    headerValue(h, "cloudfront-viewer-country"),
    headerValue(h, "x-appengine-country"),
  ];

  const geoJson = headerValue(h, "x-nf-geo") ?? headerValue(h, "x-nf-client-connection-geo");
  if (geoJson) {
    try {
      const parsed = JSON.parse(geoJson) as {
        country?: { code?: string } | string;
      };
      if (typeof parsed.country === "string") {
        candidates.unshift(parsed.country);
      } else if (parsed.country && typeof parsed.country === "object") {
        candidates.unshift(parsed.country.code ?? null);
      }
    } catch {
      /* ignore malformed geo JSON */
    }
  }

  for (const value of candidates) {
    const code = normalizeCountryCode(value);
    if (code) return code;
  }

  return null;
}

export function countryCodeFromRequest(request: Request): string | null {
  const fromHeaders = countryCodeFromHeaders(request.headers);
  if (fromHeaders) return fromHeaders;

  const geo = (request as Request & { geo?: { country?: string } }).geo;
  return normalizeCountryCode(geo?.country);
}

export async function countryCodeFromIncomingRequest(): Promise<string | null> {
  try {
    return countryCodeFromHeaders(await headers());
  } catch {
    return null;
  }
}

/** Persist geo country once — later visits do not overwrite. */
export async function persistUserCountry(
  userId: string,
  countryCode: string | null | undefined
): Promise<void> {
  const code = normalizeCountryCode(countryCode ?? undefined);
  if (!userId || !code) return;

  try {
    await db.user.updateMany({
      where: { id: userId, countryCode: null },
      data: { countryCode: code },
    });
  } catch (error) {
    console.warn("[geo] persistUserCountry", error);
  }
}

export async function persistUserCountryFromRequest(
  userId: string,
  request?: Request
): Promise<void> {
  const code = request
    ? countryCodeFromRequest(request)
    : await countryCodeFromIncomingRequest();
  await persistUserCountry(userId, code);
}
