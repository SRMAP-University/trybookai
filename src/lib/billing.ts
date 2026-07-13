import { db } from "@/lib/db";
import { knownAddonPriceIds } from "@/lib/addons";
import { PLANS, PREMIUM_TRIAL, type BillingInterval } from "@/lib/constants";
import { cleanEnv } from "@/lib/env";

export type PaidPlan = "PRO" | "ENTERPRISE";

function envPrice(...keys: string[]) {
  for (const key of keys) {
    const value = cleanEnv(process.env[key]);
    if (value) return value;
  }
  return "";
}

export function knownPaidPriceIds(): Set<string> {
  return new Set(
    [
      envPrice("STRIPE_PRO_PRICE_ID"),
      envPrice("STRIPE_PRO_YEARLY_PRICE_ID"),
      envPrice("STRIPE_ENTERPRISE_PRICE_ID"),
      envPrice("STRIPE_ENTERPRISE_YEARLY_PRICE_ID"),
      cleanEnv(PLANS.PRO.priceId),
      cleanEnv(PLANS.PRO.yearlyPriceId),
      cleanEnv(PLANS.ENTERPRISE.priceId),
      cleanEnv(PLANS.ENTERPRISE.yearlyPriceId),
    ].filter(Boolean)
  );
}

export function planFromPriceId(priceId: string | undefined): PaidPlan {
  const id = cleanEnv(priceId);
  const enterpriseIds = new Set(
    [
      envPrice("STRIPE_ENTERPRISE_PRICE_ID"),
      envPrice("STRIPE_ENTERPRISE_YEARLY_PRICE_ID"),
      cleanEnv(PLANS.ENTERPRISE.priceId),
      cleanEnv(PLANS.ENTERPRISE.yearlyPriceId),
    ].filter(Boolean)
  );
  if (id && enterpriseIds.has(id)) {
    return "ENTERPRISE";
  }
  return "PRO";
}

/** Prefer the paid plan price when the sub also has included/addon items. */
export function paidPriceIdFromSubscriptionItems(
  items: { price: { id: string; unit_amount: number | null } }[]
): string | undefined {
  const known = knownPaidPriceIds();
  const addons = knownAddonPriceIds();
  const matched = items.find((item) => known.has(item.price.id));
  if (matched) return matched.price.id;

  const paid = items.find(
    (item) =>
      (item.price.unit_amount ?? 0) > 0 && !addons.has(item.price.id)
  );
  return paid?.price.id ?? items[0]?.price.id;
}

export function isStripeBillingEnabled() {
  return !!(
    cleanEnv(process.env.STRIPE_SECRET_KEY) &&
    (envPrice("STRIPE_PRO_PRICE_ID") ||
      envPrice("STRIPE_PRO_YEARLY_PRICE_ID")) &&
    (envPrice("STRIPE_ENTERPRISE_PRICE_ID") ||
      envPrice("STRIPE_ENTERPRISE_YEARLY_PRICE_ID"))
  );
}

export function isTrialActive(user: {
  trialEndsAt: Date | null;
}): boolean {
  return Boolean(user.trialEndsAt && user.trialEndsAt.getTime() > Date.now());
}

export function trialMsRemaining(user: {
  trialEndsAt: Date | null;
}): number {
  if (!user.trialEndsAt) return 0;
  return Math.max(0, user.trialEndsAt.getTime() - Date.now());
}

/** Expire an ended trial back to Free, or return the current user. */
export async function syncUserTrialState(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  if (user.trialEndsAt && user.trialEndsAt.getTime() <= Date.now()) {
    // Stripe-managed trials are updated by webhooks (trialing → active/canceled)
    if (user.stripeSubId) {
      return user;
    }

    return db.user.update({
      where: { id: userId },
      data: {
        plan: "FREE",
        pagesLimit: PLANS.FREE.pagesLimit,
        audioMinutesLimit: PLANS.FREE.audioMinutesLimit,
        trialEndsAt: null,
      },
    });
  }

  return user;
}

export async function startPremiumTrial(userId: string) {
  const user = await syncUserTrialState(userId);

  if (user.hasUsedPremiumTrial) {
    throw new Error("You've already used your Premium free trial.");
  }
  if (user.plan !== "FREE") {
    throw new Error("Trials are only available on the Free plan.");
  }

  const startedAt = new Date();
  const endsAt = new Date(startedAt);
  endsAt.setDate(endsAt.getDate() + PREMIUM_TRIAL.days);

  return db.user.update({
    where: { id: userId },
    data: {
      plan: "ENTERPRISE",
      pagesLimit: PREMIUM_TRIAL.pagesLimit,
      audioMinutesLimit: PREMIUM_TRIAL.audioMinutesLimit,
      trialStartedAt: startedAt,
      trialEndsAt: endsAt,
      hasUsedPremiumTrial: true,
    },
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
}

/** End trial early and unlock full Premium limits. */
export async function endPremiumTrial(userId: string) {
  const user = await syncUserTrialState(userId);

  if (!isTrialActive(user)) {
    throw new Error("You are not on an active Premium trial.");
  }

  return db.user.update({
    where: { id: userId },
    data: {
      plan: "ENTERPRISE",
      pagesLimit: PLANS.ENTERPRISE.pagesLimit,
      audioMinutesLimit: PLANS.ENTERPRISE.audioMinutesLimit,
      trialEndsAt: null,
    },
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
}

export async function upgradeUserPlan(userId: string, plan: PaidPlan) {
  const config = PLANS[plan];

  return db.user.update({
    where: { id: userId },
    data: {
      plan,
      pagesLimit: config.pagesLimit,
      audioMinutesLimit: config.audioMinutesLimit,
      trialEndsAt: null,
    },
    select: {
      plan: true,
      pagesLimit: true,
      pagesUsed: true,
      audioMinutesLimit: true,
      audioMinutesUsed: true,
      trialEndsAt: true,
      hasUsedPremiumTrial: true,
    },
  });
}

export function maxBookPagesForUser(user: {
  plan: string;
  trialEndsAt: Date | null;
}): number {
  if (isTrialActive(user)) {
    return PREMIUM_TRIAL.maxBookPages;
  }
  const key = user.plan as keyof typeof PLANS;
  return PLANS[key]?.maxBookPages ?? PLANS.FREE.maxBookPages;
}

export type { BillingInterval };
