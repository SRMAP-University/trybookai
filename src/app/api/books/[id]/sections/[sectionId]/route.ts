import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveSectionContent } from "@/lib/book-editor/persist";
import { z } from "zod";

const patchSchema = z.object({
  content: z.string().max(200_000),
  title: z.string().min(1).max(300).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, sectionId } = await params;

  const section = await db.section.findFirst({
    where: {
      id: sectionId,
      chapter: { bookId: id, book: { userId: session.user.id } },
    },
    include: { chapter: { include: { book: { select: { wordsPerPage: true, status: true } } } } },
  });

  if (!section) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  if (
    section.chapter.book.status === "OUTLINING"
  ) {
    return NextResponse.json(
      { error: "Wait for generation to finish before editing this section." },
      { status: 409 }
    );
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.title) {
    await db.section.update({
      where: { id: sectionId },
      data: { title: parsed.data.title },
    });
  }

  const result = await saveSectionContent(
    sectionId,
    parsed.data.content,
    section.chapter.book.wordsPerPage ?? 300
  );

  return NextResponse.json(result);
}
