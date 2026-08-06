export type ClientSource = "ios" | "android" | "web" | "unknown";

const VALID: ReadonlySet<string> = new Set(["ios", "android", "web", "unknown"]);

/**
 * Resolve the requesting client from headers.
 * - X-BookAI-Client: ios | android | web | unknown (preferred)
 * - Bearer mobile JWT without a platform header → unknown
 * - Cookie / no Bearer → web
 */
export function resolveClientSource(request: Request): ClientSource {
  const raw = request.headers.get("x-bookai-client")?.trim().toLowerCase();
  if (raw && VALID.has(raw)) {
    return raw as ClientSource;
  }

  const auth = request.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    return "unknown";
  }

  return "web";
}

export function isAppClient(source: ClientSource): boolean {
  return source === "ios" || source === "android" || source === "unknown";
}

export function getAppVersion(request: Request): string | null {
  const v = request.headers.get("x-bookai-app-version")?.trim();
  return v && v.length > 0 ? v.slice(0, 40) : null;
}
