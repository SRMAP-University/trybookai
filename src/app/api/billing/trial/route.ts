import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createCheckoutSession,
  customerHasActiveSubscription,
  endStripeSubscriptionTrial,
  getOrCreateStripeCustomer,
  getStripe,
} from "@/lib/stripe";
import {
  endPremiumTrial,
  isStripeBillingEnabled,
  isTrialActive,
  startPremiumTrial,
  syncUserTrialState,
} from "@/lib/billing";
import { PREMIUM_TRIAL, planPriceId } from "@/lib/constants";
import { getBaseUrl } from "@/lib/url";
import {
  downgradeToFree,
  syncUserFromSubscription,
} from "@/lib/stripe-sync";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { action?: string; interval?: string };
    try {
      body = (await request.json()) as { action?: string; interval?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const action = body.action;
    if (action !== "start" && action !== "end") {
      return NextResponse.json(
        { error: "action must be start or end" },
        { status: 400 }
      );
    }

    const user = await syncUserTrialState(session.user.id);
    const interval = body.interval === "year" ? "year" : "month";

    if (action === "start") {
      if (isStripeBillingEnabled()) {
        const priceId = planPriceId("ENTERPRISE", interval);
        if (!priceId) {
          return NextResponse.json(
            { error: "Premium Stripe price is not configured." },
            { status: 400 }
          );
        }

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

        const hasActive = await customerHasActiveSubscription(customer.id);
        if (hasActive) {
          return NextResponse.json(
            {
              error:
                "You already have an active Stripe subscription. Manage it in Settings → Billing portal.",
            },
            { status: 400 }
          );
        }

        // Clear stale local sub id
        if (user.stripeSubId) {
          await db.user.update({
            where: { id: user.id },
            data: { stripeSubId: null },
          });
        }

        const origin = getBaseUrl(request);
        const checkout = await createCheckoutSession({
          customerId: customer.id,
          priceId,
          userId: user.id,
          successUrl: `${origin}/dashboard/billing?success=true&trial=1`,
          cancelUrl: `${origin}/dashboard/billing?canceled=true`,
          trialPeriodDays: PREMIUM_TRIAL.days,
          plan: "ENTERPRISE",
        });

        return NextResponse.json({
          ok: true,
          action: "start",
          url: checkout.url,
          trialDays: PREMIUM_TRIAL.days,
          amountDueToday: 0,
          message: `Continue in Stripe — ${PREMIUM_TRIAL.days}-day free trial, $0 due today.`,
        });
      }

      if (user.plan !== "FREE") {
        return NextResponse.json(
          { error: "Trials are only available on the Free plan." },
          { status: 400 }
        );
      }
      if (user.hasUsedPremiumTrial) {
        return NextResponse.json(
          { error: "You've already used your Premium free trial." },
          { status: 400 }
        );
      }

      const updated = await startPremiumTrial(session.user.id);
      return NextResponse.json({
        ok: true,
        action: "start",
        user: updated,
        message: `Premium trial started — ${PREMIUM_TRIAL.days} days with ${PREMIUM_TRIAL.pagesLimit.toLocaleString()} pages and ${Math.round(PREMIUM_TRIAL.audioMinutesLimit / 60)} hours of audio.`,
      });
    }

    // End trial early → charge now; only keep Premium if Stripe payment succeeds
    if (isStripeBillingEnabled() && user.stripeSubId) {
      const stripe = getStripe();
      let subscription = await stripe.subscriptions.retrieve(user.stripeSubId);

      if (subscription.status === "trialing" || isTrialActive(user)) {
        if (subscription.status === "trialing") {
          subscription = await endStripeSubscriptionTrial(user.stripeSubId);
        }

        // Re-fetch — ending trial can leave status mid-transition
        subscription = await stripe.subscriptions.retrieve(user.stripeSubId);
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;

        const synced = await syncUserFromSubscription(
          session.user.id,
          subscription,
          customerId
        );

        await db.user.update({
          where: { id: user.id },
          data: { hasUsedPremiumTrial: true },
        });

        if (synced.status !== "active") {
          // Cancel so Stripe doesn't keep retrying a failed card
          if (
            subscription.status === "past_due" ||
            subscription.status === "incomplete" ||
            subscription.status === "unpaid"
          ) {
            try {
              await stripe.subscriptions.cancel(subscription.id);
              await downgradeToFree(session.user.id);
            } catch (cancelError) {
              console.error("[trial end] cancel after failed payment", cancelError);
            }
          }

          return NextResponse.json(
            {
              error:
                "Payment failed (card declined or insufficient funds). You're back on the Free plan — update your payment method and subscribe again when ready.",
              action: "end",
              paymentFailed: true,
              plan: "FREE",
            },
            { status: 402 }
          );
        }

        const updated = await db.user.findUniqueOrThrow({
          where: { id: session.user.id },
          select: {
            plan: true,
            pagesLimit: true,
            pagesUsed: true,
            audioMinutesLimit: true,
            audioMinutesUsed: true,
            trialEndsAt: true,
            trialStartedAt: true,
            hasUsedPremiumTrial: true,
          },
        });

        return NextResponse.json({
          ok: true,
          action: "end",
          user: updated,
          message: "Trial ended — Premium is active and billing has started.",
        });
      }
    }

    // Local-only trial (no Stripe)
    const updated = await endPremiumTrial(session.user.id);
    return NextResponse.json({
      ok: true,
      action: "end",
      user: updated,
      message: "Trial ended — full Premium limits unlocked.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Trial action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
