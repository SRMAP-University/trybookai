import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const audio = await db.bookAudio.findUnique({
    where: { id },
    include: {
      book: { select: { userId: true } },
      tracks: { orderBy: { number: "asc" } },
    },
  });

  if (!audio || audio.book.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { book: _book, ...rest } = audio;
  return NextResponse.json(rest);
}
