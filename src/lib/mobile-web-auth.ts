import { createHash } from "node:crypto";

/**
 * The phone app signs in with Google through the website: it opens
 * /api/mobile/auth/web in the browser with a PKCE challenge, the website runs
 * its own Google login, and /api/mobile/auth/web/finish sends the browser back
 * to the app with a short-lived code that only the app holding the verifier
 * can trade for a token at /api/mobile/auth/web/exchange.
 */

/** The app's return-link schemes: the Play app, and the dev build beside it. */
const APP_SCHEMES = new Set(["trybookai", "trybookai-dev"]);

export const MOBILE_FINISH_PATH = "/api/mobile/auth/web/finish";

export function isAppScheme(value: string | null): value is string {
  return value !== null && APP_SCHEMES.has(value);
}

/** A PKCE verifier or S256 challenge (RFC 7636): 43–128 URL-safe chars. */
export function isPkceValue(value: string | null): value is string {
  return value !== null && /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

/** The app's own random value, echoed back so it knows the reply is its own. */
export function isStateValue(value: string | null): value is string {
  return value !== null && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Where the browser goes to hand the sign-in back to the app. */
export function appReturnUrl(scheme: string, params: Record<string, string>) {
  return `${scheme}://auth?${new URLSearchParams(params)}`;
}

/** NextAuth's session cookie (and its chunks, if the token is large). */
export const SESSION_COOKIE = /^(__Secure-)?authjs\.session-token(\.\d+)?$/;

/** Where NextAuth remembers to go after signing in. */
export const CALLBACK_COOKIE = /^(__Secure-)?authjs\.callback-url$/;

/** Cookie settings that remove [name] from the browser. */
export function expiredCookie(name: string) {
  return {
    name,
    value: "",
    maxAge: 0,
    path: "/",
    // __Secure- cookies can only be replaced by a Secure one.
    secure: name.startsWith("__Secure-"),
    httpOnly: true,
    sameSite: "lax" as const,
  };
}

/** [callbackUrl] as the app's finish step on this host, or null if it isn't. */
export function mobileFinishUrl(callbackUrl: string | null | undefined, base: URL) {
  if (!callbackUrl) return null;
  let target: URL;
  try {
    target = new URL(callbackUrl, base);
  } catch {
    return null;
  }
  if (target.pathname !== MOBILE_FINISH_PATH) return null;
  const url = new URL(MOBILE_FINISH_PATH, base);
  url.search = target.search;
  return url;
}

/**
 * NextAuth sends a brand-new account to /dashboard first, with the original
 * destination as callbackUrl. When that destination is the app's finish step,
 * this is where to go instead (same host, marked as a new account).
 */
export function newAccountFinishUrl(callbackUrl: string | null, base: URL) {
  const url = mobileFinishUrl(callbackUrl, base);
  url?.searchParams.set("new", "1");
  return url;
}
