import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canMakePrivate } from "@/lib/book-public";
import { getEditionRootId } from "@/lib/book-editions";
import { z } from "zod";

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
    include: {
      chapters: {
        orderBy: { number: "asc" },
        include: {
          sections: { orderBy: { number: "asc" } },
        },
      },
      generationJobs: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      audios: {
        orderBy: { createdAt: "desc" },
        include: {
          tracks: { orderBy: { number: "asc" } },
        },
      },
      user: { select: { plan: true } },
    },
  });

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const rootId = getEditionRootId(book);
  const editions = await db.book.findMany({
    where: {
      userId: session.user.id,
      OR: [{ id: rootId }, { parentBookId: rootId }],
    },
    orderBy: [{ edition: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      edition: true,
      status: true,
      coverImage: true,
      slug: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    ...book,
    canMakePrivate: canMakePrivate(book.user.plan),
    editions,
  });
}

const updateBookSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  genre: z.string().optional(),
  tone: z.string().optional(),
  audience: z.string().max(200).nullable().optional(),
  style: z.string().max(5000).nullable().optional(),
  targetPages: z.number().min(3).max(1000).optional(),
  pov: z.string().optional(),
  tense: z.string().optional(),
  language: z.string().optional(),
  chapterCount: z.number().min(1).max(100).nullable().optional(),
  sectionsPerChapter: z.number().min(2).max(8).optional(),
  wordsPerPage: z.number().min(150).max(500).optional(),
  includeDialogue: z.boolean().optional(),
  includeExamples: z.boolean().optional(),
  customInstructions: z.string().max(5000).nullable().optional(),
  characters: z.array(z.string().max(200)).max(30).nullable().optional(),
  themes: z.array(z.string().max(100)).max(20).nullable().optional(),
  forbiddenTopics: z.string().max(2000).nullable().optional(),
  model: z.string().optional(),
  creativity: z.number().min(0).max(2).optional(),
  isPublic: z.boolean().optional(),
});

export async function PATCH(
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
    include: { user: { select: { plan: true } } },
  });

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  if (book.status === "GENERATING" || book.status === "OUTLINING") {
    return NextResponse.json(
      { error: "Cannot edit settings while generation is running." },
      { status: 409 }
    );
  }

  const body = await request.json();
  const parsed = updateBookSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.isPublic === false && !canMakePrivate(book.user.plan)) {
    return NextResponse.json(
      {
        error:
          "Private books require a Pro or Enterprise plan. Upgrade to hide books from public search.",
      },
      { status: 403 }
    );
  }

  const { isPublic, ...rest } = parsed.data;

  const updated = await db.book.update({
    where: { id },
    data: {
      ...rest,
      ...(isPublic !== undefined ? { isPublic } : {}),
      characters: parsed.data.characters ?? undefined,
      themes: parsed.data.themes ?? undefined,
    },
  });

  return NextResponse.json({
    ...updated,
    canMakePrivate: canMakePrivate(book.user.plan),
  });
}

export async function DELETE(
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

  await db.book.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
