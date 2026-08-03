import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  applyPlanFromRevenueCat,
  fetchSubscriberEntitlements,
} from "@/lib/revenuecat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  entitlements: z.array(z.string()).optional(),
  appUserId: z.string().optional(),
});

/**
 * Sync the logged-in user's plan from RevenueCat entitlements.
 * Prefer server-side verification via REVENUECAT_SECRET_API_KEY when set.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const appUserId = parsed.data.appUserId?.trim() || session.user.id;
  if (appUserId !== session.user.id) {
    return NextResponse.json(
      { error: "appUserId must match the signed-in user" },
      { status: 403 }
    );
  }

  try {
    let entitlements = parsed.data.entitlements ?? [];
    const verified = await fetchSubscriberEntitlements(appUserId);
    if (verified) {
      entitlements = verified;
    }

    const result = await applyPlanFromRevenueCat(session.user.id, entitlements, {
      allowDowngrade: true,
    });

    return NextResponse.json({
      synced: true,
      verified: Boolean(verified),
      entitlements,
      ...result,
    });
  } catch (error) {
    console.error("[billing/revenuecat/sync]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync RevenueCat entitlements",
      },
      { status: 500 }
    );
  }
}
