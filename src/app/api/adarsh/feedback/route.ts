import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") ?? "all";

  const where =
    filter === "complaints"
      ? {
          OR: [
            { sentiment: "complaint" },
            { sentiment: "disappointed" },
            { rating: { lte: 2 } },
          ],
        }
      : filter === "happy"
        ? {
            OR: [{ sentiment: "happy" }, { rating: { gte: 4 } }],
          }
        : undefined;

  const feedbacks = await db.bookFeedback.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: { select: { id: true, email: true, name: true, plan: true } },
      book: {
        select: {
          id: true,
          title: true,
          status: true,
          errorMessage: true,
          progress: true,
        },
      },
    },
  });

  const summary = {
    total: feedbacks.length,
    complaints: feedbacks.filter(
      (f) =>
        f.sentiment === "complaint" ||
        f.sentiment === "disappointed" ||
        (f.rating != null && f.rating <= 2)
    ).length,
    happy: feedbacks.filter(
      (f) => f.sentiment === "happy" || (f.rating != null && f.rating >= 4)
    ).length,
    avgRating: (() => {
      const rated = feedbacks.filter((f) => f.rating != null);
      if (!rated.length) return null;
      return (
        Math.round(
          (rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length) * 10
        ) / 10
      );
    })(),
  };

  return NextResponse.json({
    summary,
    feedbacks: feedbacks.map((f) => ({
      id: f.id,
      rating: f.rating,
      sentiment: f.sentiment,
      trigger: f.trigger,
      comment: f.comment,
      createdAt: f.createdAt.toISOString(),
      user: f.user,
      book: f.book,
    })),
  });
}
