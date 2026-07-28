import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requestGenerationCancellation } from "@/lib/book-generator/background";

export async function POST(
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
  });

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  if (book.status === "COMPLETED") {
    return NextResponse.json(
      { error: "Book is already complete" },
      { status: 409 }
    );
  }

  const activeJob = await db.generationJob.findFirst({
    where: { bookId: id, status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  });

  // Idempotent: UI may still show GENERATING after a crash left the book FAILED.
  if (
    !activeJob &&
    (book.status === "PAUSED" ||
      book.status === "FAILED" ||
      book.status === "DRAFT")
  ) {
    await db.book.update({
      where: { id },
      data: {
        status: "PAUSED",
        errorMessage: book.errorMessage ?? "Generation stopped",
      },
    });
    return NextResponse.json({
      ok: true,
      status: "PAUSED",
      alreadyStopped: true,
    });
  }

  requestGenerationCancellation(id);

  await db.book.update({
    where: { id },
    data: { status: "PAUSED", errorMessage: "Generation stopped by user" },
  });

  await db.generationJob.updateMany({
    where: { bookId: id, status: { in: ["QUEUED", "RUNNING"] } },
    data: { status: "FAILED", error: "Cancelled", completedAt: new Date() },
  });

  return NextResponse.json({ ok: true, status: "PAUSED" });
}
