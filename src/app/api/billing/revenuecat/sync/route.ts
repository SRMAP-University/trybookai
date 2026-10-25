import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  applyPlanFromRevenueCat,
  fetchVerifiedSubscriber,
} from "@/lib/revenuecat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  entitlements: z.array(z.string()).optional(),
  productIds: z.array(z.string()).optional(),
  /** Plan the user just purchased in the app (PRO | ENTERPRISE | UNLIMITED). */
  requestedPlan: z.enum(["PRO", "ENTERPRISE", "UNLIMITED"]).optional(),
  appUserId: z.string().optional(),
  /** When true (default on purchase), never downgrade to FREE from empty RC data. */
  allowDowngrade: z.boolean().optional(),
});

/**
 * Sync the logged-in user's plan from RevenueCat entitlements / products.
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

  // Entitlements sent by the client can't be trusted; without the secret key
  // there's nothing to verify them against, so don't grant anything.
  if (process.env.NODE_ENV === "production" && !process.env.REVENUECAT_SECRET_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "In-app purchase verification is not configured." },
      { status: 503 }
    );
  }

  try {
    const verified = await fetchVerifiedSubscriber(appUserId);
    const entitlements = verified?.entitlements ?? parsed.data.entitlements ?? [];
    const productIds = verified?.productIds ?? parsed.data.productIds ?? [];

    const allowDowngrade =
      parsed.data.allowDowngrade ?? !parsed.data.requestedPlan;

    const result = await applyPlanFromRevenueCat(session.user.id, entitlements, {
      allowDowngrade,
      productIds,
      requestedPlan: parsed.data.requestedPlan,
    });

    return NextResponse.json({
      synced: true,
      verified: Boolean(verified),
      entitlements,
      productIds,
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
