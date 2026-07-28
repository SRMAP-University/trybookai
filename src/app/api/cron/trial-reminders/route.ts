import { NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import { sendDueTrialReminders } from "@/lib/emails/trial-reminders";
import { isMailConfigured, verifyMailConnection } from "@/lib/mail";

function authorizeCron(request: Request): boolean {
  const secret = cleanEnv(process.env.CRON_SECRET);
  if (!secret) return process.env.NODE_ENV === "development";

  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** Hourly: email users ~24h before Premium trial ends. */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMailConfigured()) {
    return NextResponse.json({
      ok: false,
      reason: "smtp_not_configured",
    });
  }

  const result = await sendDueTrialReminders();
  return NextResponse.json({ ok: true, ...result });
}

/** Manual SMTP health check (same auth as cron). */
export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMailConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "smtp_not_configured" },
      { status: 503 }
    );
  }

  const verified = await verifyMailConnection();
  return NextResponse.json({ ok: verified });
}
