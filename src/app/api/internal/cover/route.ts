import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateAndSaveBookCover } from "@/lib/book-generator/cover";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  bookId: z.string().min(1),
  force: z.boolean().optional(),
});

function authorize(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;
  const secrets = [
    process.env.GENERATION_WORKER_SECRET,
    process.env.CRON_SECRET,
    process.env.INTERNAL_PUSH_SECRET,
  ].filter(Boolean) as string[];
  return secrets.some((s) => s === token);
}

/**
 * POST /api/internal/cover
 * Called by the Cloudflare generation worker to create a book cover.
 */
export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { bookId, force } = parsed.data;

  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { id: true, coverImage: true, status: true },
  });

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  if (book.coverImage && !force) {
    return NextResponse.json({
      coverImage: book.coverImage,
      skipped: true,
    });
  }

  try {
    const result = await generateAndSaveBookCover(bookId, { force: !!force });
    return NextResponse.json({ ...result, skipped: false });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cover generation failed";
    console.error(`Internal cover generation failed for ${bookId}:`, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
