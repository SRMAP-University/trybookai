import { NextResponse } from "next/server";
import { z } from "zod";
import {
  notifyBookProgress,
  nextPushMilestone,
  sendPushToUser,
} from "@/lib/push";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  userId: z.string().min(1),
  bookId: z.string().min(1),
  phase: z.enum([
    "started",
    "outline",
    "progress",
    "completed",
    "failed",
    "custom",
  ]),
  progress: z.number().min(0).max(100).optional(),
  title: z.string().optional(),
  /** For custom messages */
  notificationTitle: z.string().optional(),
  notificationBody: z.string().optional(),
  /** Last milestone already notified (worker tracks this) */
  lastMilestone: z.number().optional(),
});

function authorize(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;
  const secrets = [
    process.env.GENERATION_WORKER_SECRET,
    process.env.CRON_SECRET,
    process.env.INTERNAL_PUSH_SECRET,
  ].filter(Boolean) as string[];
  return secrets.some((s) => s === token);
}

/**
 * POST /api/internal/push
 * Called by the Cloudflare generation worker (or cron) to deliver FCM pushes.
 */
export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const body = parsed.data;

  if (body.phase === "custom") {
    if (!body.notificationTitle || !body.notificationBody) {
      return NextResponse.json(
        { error: "notificationTitle and notificationBody required" },
        { status: 400 }
      );
    }
    const result = await sendPushToUser(body.userId, {
      title: body.notificationTitle,
      body: body.notificationBody,
      data: { type: "custom", bookId: body.bookId },
    });
    return NextResponse.json(result);
  }

  const book = await db.book.findUnique({
    where: { id: body.bookId },
    select: { title: true, progress: true, userId: true },
  });
  if (!book || book.userId !== body.userId) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const progress = body.progress ?? book.progress ?? 0;
  const title = body.title ?? book.title;

  if (body.phase === "progress") {
    const milestone = nextPushMilestone(body.lastMilestone, progress);
    if (milestone == null) {
      return NextResponse.json({ sent: 0, skipped: "no_milestone", milestone: null });
    }
    const result = await notifyBookProgress({
      userId: body.userId,
      bookId: body.bookId,
      title,
      progress: milestone,
      phase: "progress",
    });
    return NextResponse.json({ ...result, milestone });
  }

  const result = await notifyBookProgress({
    userId: body.userId,
    bookId: body.bookId,
    title,
    progress,
    phase: body.phase,
  });

  return NextResponse.json(result);
}
