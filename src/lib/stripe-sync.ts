import type Stripe from "stripe";
import { db } from "@/lib/db";
import {
  capacityFromQuantities,
  limitsFromPlanAndBonuses,
} from "@/lib/addons";
import { PLANS } from "@/lib/constants";
import {
  paidPriceIdFromSubscriptionItems,
  planFromPriceId,
} from "@/lib/billing";
import { getStripe } from "@/lib/stripe";

export async function resolveUserIdFromSubscription(
  subscription: Stripe.Subscription,
  customerId?: string | null
): Promise<string | null> {
  if (subscription.metadata?.userId) {
    return subscription.metadata.userId;
  }

  if (subscription.id) {
    const bySub = await db.user.findFirst({
      where: { stripeSubId: subscription.id },
      select: { id: true },
    });
    if (bySub) return bySub.id;
  }

  const cid =
    customerId ||
    (typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id);

  if (cid) {
    const byCustomer = await db.user.findFirst({
      where: { stripeCustomerId: cid },
      select: { id: true },
    });
    if (byCustomer) return byCustomer.id;
  }

  return null;
}

export async function downgradeToFree(userId: string) {
  await db.user.update({
    where: { id: userId },
    data: {
      plan: "FREE",
      pagesLimit: PLANS.FREE.pagesLimit,
      audioMinutesLimit: PLANS.FREE.audioMinutesLimit,
      pagesBonus: 0,
      audioMinutesBonus: 0,
      stripeSubId: null,
      trialEndsAt: null,
    },
  });
}

export async function applyCapacityPurchase(
  userId: string,
  pagesQty: number,
  audioQty: number
) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.plan !== "PRO" && user.plan !== "ENTERPRISE") return;

  const added = capacityFromQuantities(pagesQty, audioQty);
  if (added.pagesBonus <= 0 && added.audioMinutesBonus <= 0) return;

  const pagesBonus = user.pagesBonus + added.pagesBonus;
  const audioMinutesBonus = user.audioMinutesBonus + added.audioMinutesBonus;
  const limits = limitsFromPlanAndBonuses({
    plan: user.plan,
    isTrialing: false,
    pagesBonus,
    audioMinutesBonus,
  });

  await db.user.update({
    where: { id: userId },
    data: {
      pagesBonus: limits.pagesBonus,
      audioMinutesBonus: limits.audioMinutesBonus,
      pagesLimit: limits.pagesLimit,
      audioMinutesLimit: limits.audioMinutesLimit,
    },
  });
}

export async function syncUserFromSubscription(
  userId: string,
  subscription: Stripe.Subscription,
  customerId?: string | null
) {
  const priceId = paidPriceIdFromSubscriptionItems(subscription.items.data);
  const plan = planFromPriceId(priceId);
  const status = subscription.status;
  const isTrialing = status === "trialing";
  const trialEndsAt =
    isTrialing && subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null;

  // Only trialing / active unlock paid limits. Failed cards (incomplete,
  // past_due, unpaid, canceled, …) must not keep Premium access.
  const paidOk = status === "active" || status === "trialing";
  if (!paidOk) {
    await downgradeToFree(userId);
    return { plan: "FREE" as const, status };
  }

  const existing = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { pagesBonus: true, audioMinutesBonus: true },
  });

  const limits = limitsFromPlanAndBonuses({
    plan,
    isTrialing,
    pagesBonus: existing.pagesBonus,
    audioMinutesBonus: existing.audioMinutesBonus,
  });

  const data: {
    plan: typeof plan;
    pagesLimit: number;
    audioMinutesLimit: number;
    pagesBonus: number;
    audioMinutesBonus: number;
    stripeSubId: string | null;
    stripeCustomerId?: string;
    trialEndsAt: Date | null;
    trialStartedAt?: Date | null;
    hasUsedPremiumTrial?: boolean;
  } = {
    plan,
    pagesLimit: limits.pagesLimit,
    audioMinutesLimit: limits.audioMinutesLimit,
    pagesBonus: limits.pagesBonus,
    audioMinutesBonus: limits.audioMinutesBonus,
    stripeSubId: subscription.id,
    trialEndsAt: isTrialing ? trialEndsAt : null,
  };

  if (customerId) {
    data.stripeCustomerId = customerId;
  }

  if (isTrialing) {
    data.hasUsedPremiumTrial = true;
    if (!trialEndsAt) {
      data.trialStartedAt = new Date();
    }
  }

  await db.user.update({
    where: { id: userId },
    data,
  });

  return {
    plan,
    status,
    pagesLimit: limits.pagesLimit,
    audioMinutesLimit: limits.audioMinutesLimit,
    isTrialing,
  };
}

/**
 * Pull the customer's latest subscription from Stripe and apply plan limits.
 * Used after checkout (webhooks may lag / fail) and as a self-heal for stuck Free accounts.
 */
export async function syncUserSubscriptionFromStripe(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      plan: true,
      pagesLimit: true,
      audioMinutesLimit: true,
      stripeCustomerId: true,
      stripeSubId: true,
      pagesBonus: true,
      audioMinutesBonus: true,
    },
  });

  const stripe = getStripe();
  let customerId = user.stripeCustomerId;

  if (!customerId) {
    const customers = await stripe.customers.list({
      email: user.email,
      limit: 5,
    });
    const match = customers.data.find((c) => c.metadata?.userId === userId);
    customerId = match?.id ?? customers.data[0]?.id ?? null;
    if (customerId) {
      await db.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }
  }

  if (!customerId && !user.stripeSubId) {
    return {
      synced: false as const,
      reason: "no_stripe_customer" as const,
      user,
    };
  }

  let subscription: Stripe.Subscription | null = null;

  if (user.stripeSubId) {
    try {
      subscription = await stripe.subscriptions.retrieve(user.stripeSubId);
    } catch {
      subscription = null;
    }
  }

  if (!subscription && customerId) {
    const list = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });
    subscription =
      list.data.find((s) => s.status === "active" || s.status === "trialing") ??
      list.data.find(
        (s) =>
          s.status === "past_due" ||
          s.status === "incomplete" ||
          s.status === "unpaid"
      ) ??
      list.data[0] ??
      null;
  }

  if (!subscription) {
    if (user.plan !== "FREE" || user.pagesLimit > 50 || user.audioMinutesLimit > 0) {
      await downgradeToFree(userId);
      const updated = await db.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          plan: true,
          pagesLimit: true,
          pagesUsed: true,
          audioMinutesLimit: true,
          audioMinutesUsed: true,
          trialEndsAt: true,
          stripeSubId: true,
          stripeCustomerId: true,
        },
      });
      return {
        synced: true as const,
        plan: "FREE" as const,
        status: "canceled",
        reason: "no_subscription" as const,
        user: updated,
      };
    }
    return {
      synced: false as const,
      reason: "no_subscription" as const,
      user,
    };
  }

  if (!subscription.metadata?.userId) {
    await stripe.subscriptions.update(subscription.id, {
      metadata: { ...subscription.metadata, userId },
    });
  }

  const result = await syncUserFromSubscription(
    userId,
    subscription,
    customerId
  );

  const updated = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      plan: true,
      pagesLimit: true,
      pagesUsed: true,
      audioMinutesLimit: true,
      audioMinutesUsed: true,
      trialEndsAt: true,
      stripeSubId: true,
      stripeCustomerId: true,
    },
  });

  return {
    synced: true as const,
    ...result,
    user: updated,
  };
}
