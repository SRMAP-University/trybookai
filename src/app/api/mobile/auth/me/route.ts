import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { verifyMobileToken } from "@/lib/mobile-auth";
import { isTrialActive } from "@/lib/billing";

/** GET /api/mobile/auth/me — current user from Bearer token */
export async function GET() {
  const h = await headers();
  const authHeader = h.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyMobileToken(authHeader.slice(7));
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      plan: true,
      pagesUsed: true,
      pagesLimit: true,
      audioMinutesUsed: true,
      audioMinutesLimit: true,
      trialEndsAt: true,
      hasUsedPremiumTrial: true,
      stripeSubId: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      plan: user.plan,
      pagesUsed: user.pagesUsed,
      pagesLimit: user.pagesLimit,
      audioMinutesUsed: user.audioMinutesUsed,
      audioMinutesLimit: user.audioMinutesLimit,
      onTrial: isTrialActive(user),
      trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
      hasUsedPremiumTrial: user.hasUsedPremiumTrial,
      hasStripeSubscription: Boolean(user.stripeSubId),
    },
  });
}
