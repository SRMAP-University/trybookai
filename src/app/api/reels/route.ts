import { NextResponse, after } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeVoiceSettings } from "@/lib/elevenlabs-voices";
import { ensureReelGenerationRunning } from "@/lib/reel-generator/background";
import { ReelError, createReel } from "@/lib/reel-generator/create";
import { getReelAllowance } from "@/lib/reel-generator/quota";
import { loadReelView, reelViewInclude, toReelView } from "@/lib/reel-generator/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const startSchema = z.object({
  bookId: z.string().min(1),
  format: z.enum(["SHORTS", "TRAILER", "AUDIOBOOK"]),
  chapterIds: z.array(z.string().min(1)).max(200).optional(),
  stylePreset: z.string().max(40).optional(),
  pacing: z.enum(["dynamic", "calm"]).optional(),
  voiceId: z.string().optional(),
  voiceName: z.string().optional(),
  voiceSettings: z
    .object({
      stability: z.number().min(0).max(1).optional(),
      similarityBoost: z.number().min(0).max(1).optional(),
      style: z.number().min(0).max(1).optional(),
      speed: z.number().min(0.7).max(1.2).optional(),
      useSpeakerBoost: z.boolean().optional(),
      modelId: z.string().optional(),
      backgroundMusic: z.enum(["off", "subtle", "cinematic"]).optional(),
    })
    .optional(),
});

/** GET /api/reels?bookId= — the book's reels plus this month's allowance. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bookId = new URL(request.url).searchParams.get("bookId");
  const reels = await db.storyReel.findMany({
    where: {
      userId: session.user.id,
      deletedAt: null,
      ...(bookId ? { bookId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: reelViewInclude,
    take: 50,
  });

  return NextResponse.json({
    reels: reels.map(toReelView),
    allowance: await getReelAllowance(session.user.id),
  });
}

/** POST /api/reels — create a reel and start generating it. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const { id } = await createReel({
      userId: session.user.id,
      bookId: parsed.data.bookId,
      format: parsed.data.format,
      chapterIds: parsed.data.chapterIds,
      stylePreset: parsed.data.stylePreset,
      pacing: parsed.data.pacing,
      voiceId: parsed.data.voiceId,
      voiceName: parsed.data.voiceName,
      voiceSettings: normalizeVoiceSettings({
        backgroundMusic: "subtle",
        ...parsed.data.voiceSettings,
      }),
    });

    const result = await ensureReelGenerationRunning(id);
    // Keep this function alive while the job runs, up to maxDuration.
    if (result.task) after(() => result.task);

    return NextResponse.json({ reel: await loadReelView({ id }) }, { status: 201 });
  } catch (error) {
    if (error instanceof ReelError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[reels] create failed:", error);
    return NextResponse.json({ error: "Couldn't start the reel. Try again." }, { status: 500 });
  }
}
