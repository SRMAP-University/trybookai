import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureGenerationRunning } from "@/lib/book-generator/background";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const result = await ensureGenerationRunning(id, session.user.id);
    return NextResponse.json(
      {
        started: result.started,
        alreadyRunning: result.alreadyRunning,
        completed: "completed" in result ? result.completed : false,
      },
      { status: 202 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
