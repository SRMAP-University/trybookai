import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    // Sequential queries — one pool client at a time (Neon-friendly).
    const books = await db.book.findMany({
      where: {
        userId,
        status: { in: ["OUTLINING", "GENERATING"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        status: true,
        progress: true,
        currentPages: true,
        targetPages: true,
        updatedAt: true,
      },
    });

    const audios = await db.bookAudio.findMany({
      where: {
        status: { in: ["PENDING", "GENERATING"] },
        book: { userId },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        bookId: true,
        type: true,
        status: true,
        progress: true,
        title: true,
        updatedAt: true,
        book: { select: { title: true } },
      },
    });

    return NextResponse.json({
      books,
      audios: audios.map((audio) => ({
        id: audio.id,
        bookId: audio.bookId,
        bookTitle: audio.book.title,
        type: audio.type,
        status: audio.status,
        progress: audio.progress,
        title: audio.title,
        updatedAt: audio.updatedAt,
      })),
    });
  } catch (error) {
    // Neon pooler drops idle connections — don't 500 the widget poll.
    console.warn(
      "[jobs/active]",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ books: [], audios: [], degraded: true });
  }
}
