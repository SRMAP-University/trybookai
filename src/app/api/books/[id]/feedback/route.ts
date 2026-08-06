import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const postSchema = z.object({
  rating: z.number().int().min(1).max(5).optional().nullable(),
  sentiment: z.enum(["happy", "ok", "disappointed", "complaint"]),
  trigger: z.enum(["completed", "failed", "manual"]),
  comment: z.string().max(4000).optional().nullable(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const book = await db.book.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const feedbacks = await db.bookFeedback.findMany({
    where: { bookId: id, userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      rating: true,
      sentiment: true,
      trigger: true,
      comment: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    feedbacks,
    hasCompletedReview: feedbacks.some((f) => f.trigger === "completed"),
    hasFailedReview: feedbacks.some((f) => f.trigger === "failed"),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const book = await db.book.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, status: true },
  });
  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { rating, sentiment, trigger, comment } = parsed.data;
  const trimmed = comment?.trim() || null;

  if (sentiment === "complaint" && !trimmed) {
    return NextResponse.json(
      { error: "Please describe the issue." },
      { status: 400 }
    );
  }

  // One review prompt response per completed/failed trigger; manual reports always allowed.
  if (trigger === "completed" || trigger === "failed") {
    const existing = await db.bookFeedback.findFirst({
      where: { bookId: id, userId: session.user.id, trigger },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({
        feedback: existing,
        skipped: true,
      });
    }
  }

  try {
    const feedback = await db.bookFeedback.create({
      data: {
        bookId: id,
        userId: session.user.id,
        rating: rating ?? null,
        sentiment,
        trigger,
        comment: trimmed,
      },
    });

    return NextResponse.json({ feedback, skipped: false });
  } catch (error) {
    console.error("[book feedback]", error);
    const message =
      error instanceof Error ? error.message : "Could not save feedback";
    // Surface missing-table / schema drift clearly in API responses.
    if (/BookFeedback|does not exist|Unknown arg/i.test(message)) {
      return NextResponse.json(
        { error: "Feedback storage isn’t ready yet. Please try again shortly." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Could not save feedback" }, { status: 500 });
  }
}
