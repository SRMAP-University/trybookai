import { NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { regenerateChapter } from "@/lib/book-generator";
import {
  resetChapterScenes,
  scheduleBookIllustrations,
} from "@/lib/book-illustrations/schedule";

// Re-illustrating the rewritten chapter runs in after().
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, chapterId } = await params;

  const book = await db.book.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  try {
    const chapter = await regenerateChapter(chapterId, session.user.id);
    if (book.includeIllustrations) {
      // Scene pictures pointed at the old paragraphs; plan new ones.
      await resetChapterScenes(chapterId);
      const { task } = await scheduleBookIllustrations(id);
      if (task) after(() => task);
    }
    return NextResponse.json(chapter);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Regeneration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
