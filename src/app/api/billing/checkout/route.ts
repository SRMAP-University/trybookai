import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createCheckoutSession,
  createCustomerPortalSession,
  customerHasActiveSubscription,
  getOrCreateStripeCustomer,
} from "@/lib/stripe";
import {
  isStripeBillingEnabled,
  upgradeUserPlan,
  type PaidPlan,
} from "@/lib/billing";
import { PREMIUM_TRIAL, planPriceId, type BillingInterval } from "@/lib/constants";
import { getBaseUrl } from "@/lib/url";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { plan?: string; interval?: string; withTrial?: boolean };
    try {
      body = (await request.json()) as {
        plan?: string;
        interval?: string;
        withTrial?: boolean;
      };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { plan } = body;
    const interval: BillingInterval =
      body.interval === "year" ? "year" : "month";

    if (plan !== "PRO" && plan !== "ENTERPRISE") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const paidPlan = plan as PaidPlan;

    if (!isStripeBillingEnabled()) {
      const user = await upgradeUserPlan(session.user.id, paidPlan);
      return NextResponse.json({
        upgraded: true,
        instant: true,
        plan: user.plan,
        pagesLimit: user.pagesLimit,
        audioMinutesLimit: user.audioMinutesLimit,
        interval,
      });
    }

    const priceId = planPriceId(paidPlan, interval);
    if (!priceId) {
      const user = await upgradeUserPlan(session.user.id, paidPlan);
      return NextResponse.json({
        upgraded: true,
        instant: true,
        plan: user.plan,
        pagesLimit: user.pagesLimit,
        audioMinutesLimit: user.audioMinutesLimit,
        interval,
      });
    }

    const user = await db.user.findUniqueOrThrow({
      where: { id: session.user.id },
    });

    const customer = await getOrCreateStripeCustomer({
      email: user.email,
      name: user.name,
      userId: user.id,
    });

    if (!user.stripeCustomerId || user.stripeCustomerId !== customer.id) {
      await db.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customer.id },
      });
    }

    // Clear stale local sub id if Stripe has no active/trialing subscription
    const hasActive = await customerHasActiveSubscription(customer.id);
    if (user.stripeSubId && !hasActive) {
      await db.user.update({
        where: { id: user.id },
        data: { stripeSubId: null },
      });
    }

    const origin = getBaseUrl(request);

    // Premium always gets a 2-day free trial unless they already have an active Stripe sub
    // (or caller explicitly disables it with withTrial: false)
    const offerTrial =
      paidPlan === "ENTERPRISE" &&
      !hasActive &&
      body.withTrial !== false;

    const checkoutSession = await createCheckoutSession({
      customerId: customer.id,
      priceId,
      userId: user.id,
      successUrl: `${origin}/dashboard/billing?success=true${offerTrial ? "&trial=1" : ""}`,
      cancelUrl: `${origin}/dashboard/billing?canceled=true`,
      trialPeriodDays: offerTrial ? PREMIUM_TRIAL.days : undefined,
      plan: paidPlan,
    });

    return NextResponse.json({
      url: checkoutSession.url,
      instant: false,
      trial: offerTrial,
      trialDays: offerTrial ? PREMIUM_TRIAL.days : 0,
      amountDueToday: offerTrial ? 0 : undefined,
    });
  } catch (error) {
    console.error("[billing checkout POST]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to start checkout",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.user.findUniqueOrThrow({
      where: { id: session.user.id },
    });

    if (!user.stripeCustomerId) {
      return NextResponse.json({ error: "No billing account" }, { status: 400 });
    }

    const origin = getBaseUrl(request);

    const portalSession = await createCustomerPortalSession({
      customerId: user.stripeCustomerId,
      returnUrl: `${origin}/dashboard/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("[billing checkout GET]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to open billing portal",
      },
      { status: 500 }
    );
  }
}
