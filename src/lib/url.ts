import { cleanEnvUrl } from "@/lib/env";

/**
 * Canonical site origin for redirects, Stripe return URLs, and absolute links.
 * Prefer env over the request Origin header so www/apex never mix mid-session.
 * In local dev, prefer the request Host so Stripe returns to the same port
 * (Next often binds 3001 when 3000 is busy).
 */
export function getBaseUrl(request?: Request) {
  if (request && process.env.NODE_ENV === "development") {
    const host =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (host && /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host.split(",")[0]!.trim())) {
      const protocol = request.headers.get("x-forwarded-proto") ?? "http";
      return `${protocol}://${host.split(",")[0]!.trim()}`;
    }
  }

  const fromEnv =
    cleanEnvUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    cleanEnvUrl(process.env.AUTH_URL) ||
    cleanEnvUrl(process.env.NEXTAUTH_URL);
  if (fromEnv) return fromEnv;

  if (request) {
    const host =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (host) {
      const protocol = request.headers.get("x-forwarded-proto") ?? "https";
      return `${protocol}://${host.split(",")[0]!.trim()}`;
    }
  }

  if (process.env.VERCEL_URL) {
    return `https://${cleanEnvUrl(process.env.VERCEL_URL) ?? process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}
