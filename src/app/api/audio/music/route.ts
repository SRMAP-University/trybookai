import { audioPublicPrefix } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same-origin passthrough for background-music cues. The player mixes cues
 * with the Web Audio API (the only way to set music volume on iOS), which
 * needs same-origin audio; cues live on the public R2 bucket.
 *
 * Only our own `audio/…/music-<mood>.mp3` objects are served.
 */
export async function GET(request: Request) {
  const src = new URL(request.url).searchParams.get("src") ?? "";
  const prefix = audioPublicPrefix();
  if (
    !prefix ||
    !src.startsWith(prefix) ||
    !/\/music-[a-z]+\.mp3$/.test(src) ||
    src.slice(prefix.length).includes("..")
  ) {
    return new Response("Not found", { status: 404 });
  }

  const range = request.headers.get("range");
  const upstream = await fetch(src, {
    headers: range ? { Range: range } : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (!upstream.ok || !upstream.body) {
    return new Response("Not found", { status: upstream.status === 404 ? 404 : 502 });
  }

  const headers = new Headers({
    "Content-Type": "audio/mpeg",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
  });
  for (const name of ["content-length", "content-range"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
