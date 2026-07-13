import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateAndSaveBookCover } from "@/lib/book-generator/cover";

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
    select: { id: true, status: true },
  });

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  if (
    book.status !== "COMPLETED" &&
    book.status !== "GENERATING" &&
    book.status !== "OUTLINING"
  ) {
    return NextResponse.json(
      { error: "Cover is available once the book has content to illustrate." },
      { status: 409 }
    );
  }

  try {
    const result = await generateAndSaveBookCover(id, { force: true });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cover generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
