import { NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import { recoverStaleGenerationJobs } from "@/lib/book-generator/background";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(request: Request): boolean {
  const secret = cleanEnv(process.env.CRON_SECRET);
  if (!secret) return process.env.NODE_ENV === "development";

  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/**
 * Every 5 minutes: requeue stale RUNNING/QUEUED jobs, force-restart hung CF
 * workflows, and fail orphan GENERATING books with no active job.
 */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await recoverStaleGenerationJobs({ forceRestart: true });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/generation-sweep]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Sweep failed",
      },
      { status: 500 }
    );
  }
}
