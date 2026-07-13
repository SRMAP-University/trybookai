import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ADDONS,
  capacityFromQuantities,
  limitsFromPlanAndBonuses,
} from "@/lib/addons";
import {
  isStripeBillingEnabled,
  isTrialActive,
} from "@/lib/billing";
import {
  createCapacityCheckoutSession,
  getOrCreateStripeCustomer,
} from "@/lib/stripe";

const MAX_QTY = 50;

function clampQty(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_QTY, Math.floor(n));
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      plan: true,
      pagesLimit: true,
      audioMinutesLimit: true,
      pagesUsed: true,
      audioMinutesUsed: true,
      pagesBonus: true,
      audioMinutesBonus: true,
      trialEndsAt: true,
    },
  });

  return NextResponse.json({
    pagesBonus: user.pagesBonus,
    audioMinutesBonus: user.audioMinutesBonus,
    pagesLimit: user.pagesLimit,
    audioMinutesLimit: user.audioMinutesLimit,
    pagesUsed: user.pagesUsed,
    audioMinutesUsed: user.audioMinutesUsed,
    onTrial: isTrialActive(user),
    addons: {
      pages: {
        name: ADDONS.PAGES.name,
        description: ADDONS.PAGES.description,
        unitPrice: ADDONS.PAGES.unitPrice,
        pagesPerUnit: ADDONS.PAGES.pagesPerUnit,
      },
      audio: {
        name: ADDONS.AUDIO.name,
        description: ADDONS.AUDIO.description,
        unitPrice: ADDONS.AUDIO.unitPrice,
        audioMinutesPerUnit: ADDONS.AUDIO.audioMinutesPerUnit,
      },
    },
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const pagesQty = clampQty(body.pagesQty);
  const audioQty = clampQty(body.audioQty);

  if (pagesQty <= 0 && audioQty <= 0) {
    return NextResponse.json(
      { error: "Select at least one capacity pack." },
      { status: 400 }
    );
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
  });

  if (user.plan !== "PRO" && user.plan !== "ENTERPRISE") {
    return NextResponse.json(
      { error: "Upgrade to Pro or Premium before buying capacity." },
      { status: 403 }
    );
  }

  if (isTrialActive(user)) {
    return NextResponse.json(
      {
        error:
          "Capacity packs are available after your free trial. Unlock full Premium first.",
      },
      { status: 403 }
    );
  }

  const added = capacityFromQuantities(pagesQty, audioQty);
  const total =
    pagesQty * ADDONS.PAGES.unitPrice + audioQty * ADDONS.AUDIO.unitPrice;

  if (isStripeBillingEnabled()) {
    if (!session.user.email) {
      return NextResponse.json(
        { error: "Account email is required for checkout." },
        { status: 400 }
      );
    }

    const customer = await getOrCreateStripeCustomer({
      email: session.user.email,
      name: session.user.name,
      userId: user.id,
    });

    if (!user.stripeCustomerId) {
      await db.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customer.id },
      });
    }

    const origin = new URL(request.url).origin;
    const checkout = await createCapacityCheckoutSession({
      customerId: customer.id,
      userId: user.id,
      pagesQty,
      audioQty,
      successUrl: `${origin}/dashboard/billing?capacity=1`,
      cancelUrl: `${origin}/dashboard/billing?canceled=true`,
    });

    return NextResponse.json({
      url: checkout.url,
      message: `Continue to Stripe to pay $${total} once.`,
    });
  }

  // Instant / no-Stripe path
  const limits = limitsFromPlanAndBonuses({
    plan: user.plan,
    isTrialing: false,
    pagesBonus: user.pagesBonus + added.pagesBonus,
    audioMinutesBonus: user.audioMinutesBonus + added.audioMinutesBonus,
  });

  await db.user.update({
    where: { id: user.id },
    data: {
      pagesBonus: limits.pagesBonus,
      audioMinutesBonus: limits.audioMinutesBonus,
      pagesLimit: limits.pagesLimit,
      audioMinutesLimit: limits.audioMinutesLimit,
    },
  });

  return NextResponse.json({
    ok: true,
    pagesBonus: limits.pagesBonus,
    audioMinutesBonus: limits.audioMinutesBonus,
    pagesLimit: limits.pagesLimit,
    audioMinutesLimit: limits.audioMinutesLimit,
    message: `Added capacity ($${total} simulated — Stripe not configured).`,
  });
}
