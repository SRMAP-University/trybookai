import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** ElevenLabs TTS uses output_format=mp3_44100_128 */
const MP3_BITRATE = 128_000;

async function fileSizeBytes(url: string): Promise<number> {
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "follow" });
    const len = Number(head.headers.get("content-length"));
    if (head.ok && Number.isFinite(len) && len > 0) return len;
  } catch {
    // fall through
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
    });
    const range = res.headers.get("content-range");
    const match = range?.match(/\/(\d+)\s*$/);
    if (match) {
      const total = Number(match[1]);
      if (Number.isFinite(total) && total > 0) return total;
    }
  } catch {
    // fall through
  }

  return 0;
}

/**
 * Resolve real MP3 duration from file size (CBR 128kbps).
 * Avoids wrong HTML5 audio metadata on CDN/VBR-tagged files.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ trackId: string }> }
) {
  const { trackId } = await context.params;
  const session = await auth();

  const track = await db.bookAudioTrack.findUnique({
    where: { id: trackId },
    include: {
      audio: {
        include: {
          book: { select: { userId: true, isPublic: true } },
        },
      },
    },
  });

  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const book = track.audio.book;
  const allowed =
    book.isPublic ||
    (session?.user?.id && session.user.id === book.userId);
  if (!allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (track.durationMs && track.durationMs > 0) {
    return NextResponse.json({ durationMs: track.durationMs });
  }

  const bytes = await fileSizeBytes(track.audioUrl);
  if (bytes <= 0) {
    return NextResponse.json(
      { error: "Could not determine audio length" },
      { status: 422 }
    );
  }

  const durationMs = Math.max(
    1000,
    Math.round((bytes * 8 * 1000) / MP3_BITRATE)
  );

  await db.bookAudioTrack.update({
    where: { id: track.id },
    data: { durationMs },
  });

  return NextResponse.json({ durationMs });
}
