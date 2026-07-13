import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isStripeBillingEnabled } from "@/lib/billing";
import { syncUserSubscriptionFromStripe } from "@/lib/stripe-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pull latest Stripe subscription and apply plan limits to the logged-in user. */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isStripeBillingEnabled()) {
    return NextResponse.json({
      synced: false,
      reason: "stripe_disabled",
    });
  }

  try {
    const result = await syncUserSubscriptionFromStripe(session.user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[billing sync]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync subscription",
      },
      { status: 500 }
    );
  }
}
