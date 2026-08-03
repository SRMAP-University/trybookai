import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  applyPlanFromRevenueCat,
  fetchSubscriberEntitlements,
  fetchSubscriberProductIds,
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

  try {
    let entitlements = parsed.data.entitlements ?? [];
    let productIds = parsed.data.productIds ?? [];

    const verifiedEntitlements = await fetchSubscriberEntitlements(appUserId);
    if (verifiedEntitlements) {
      entitlements = verifiedEntitlements;
    }
    const verifiedProducts = await fetchSubscriberProductIds(appUserId);
    if (verifiedProducts) {
      productIds = verifiedProducts;
    }

    const allowDowngrade =
      parsed.data.allowDowngrade ?? !parsed.data.requestedPlan;

    const result = await applyPlanFromRevenueCat(session.user.id, entitlements, {
      allowDowngrade,
      productIds,
      requestedPlan: parsed.data.requestedPlan,
    });

    return NextResponse.json({
      synced: true,
      verified: Boolean(verifiedEntitlements || verifiedProducts),
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
