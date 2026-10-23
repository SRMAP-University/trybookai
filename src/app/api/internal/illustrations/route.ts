import { NextResponse, after } from "next/server";
import { z } from "zod";
import { scheduleBookIllustrations } from "@/lib/book-illustrations/schedule";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  bookId: z.string().min(1),
  chain: z.number().int().min(0).max(100).optional(),
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
 * POST /api/internal/illustrations
 * Continue drawing a book's pictures in a fresh function. Called by a job
 * that's about to hit its time limit, and usable by workers or cron.
 */
export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { started, task } = await scheduleBookIllustrations(parsed.data.bookId, {
    chain: parsed.data.chain,
  });
  if (task) after(() => task);
  return NextResponse.json({ started }, { status: 202 });
}
