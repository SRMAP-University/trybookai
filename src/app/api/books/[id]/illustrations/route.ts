import { NextResponse, after } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getIllustrationStatus } from "@/lib/book-illustrations/status";
import {
  retryFailedIllustrations,
  scheduleBookIllustrations,
} from "@/lib/book-illustrations/schedule";

export const runtime = "nodejs";
// Starting a job keeps this function alive while it draws (see after()).
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

async function ownedBook(id: string, userId: string) {
  return db.book.findFirst({ where: { id, userId }, select: { id: true } });
}

/** Start (or resume) drawing, keeping this function alive for the job. */
async function startJob(bookId: string): Promise<boolean> {
  const { started, task } = await scheduleBookIllustrations(bookId);
  if (task) after(() => task);
  return started;
}

/**
 * GET /api/books/[id]/illustrations
 * Picture progress for the book page. Also resumes a job that died (e.g. a
 * function limit) whenever there's work left and nobody is on it.
 */
export async function GET(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!(await ownedBook(id, session.user.id))) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const status = await getIllustrationStatus(id);
  if (!status) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  if (status.actionable && !status.running && (await startJob(id))) {
    status.running = true;
  }
  return NextResponse.json(status);
}

const postSchema = z.object({ retry: z.boolean().optional() });

/**
 * POST /api/books/[id]/illustrations
 * "Illustrate this book": turn pictures on and draw them for every finished
 * chapter. With `retry`, failed pictures are tried again.
 */
export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!(await ownedBook(id, session.user.id))) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const parsed = postSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const written = await db.chapter.count({ where: { bookId: id, status: "COMPLETED" } });
  if (written === 0) {
    return NextResponse.json(
      { error: "Pictures are added once the first chapter is written." },
      { status: 409 }
    );
  }

  await db.book.update({ where: { id }, data: { includeIllustrations: true } });
  if (parsed.data.retry) await retryFailedIllustrations(id);
  const started = await startJob(id);

  const status = await getIllustrationStatus(id);
  return NextResponse.json({ ...status, running: started || status?.running });
}

/**
 * DELETE /api/books/[id]/illustrations
 * Stop adding pictures to new chapters. Pictures already in the book stay.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!(await ownedBook(id, session.user.id))) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }
  await db.book.update({ where: { id }, data: { includeIllustrations: false } });
  return NextResponse.json(await getIllustrationStatus(id));
}
