import { PLANS } from "@/lib/constants";
import { db } from "@/lib/db";
import { cleanEnv } from "@/lib/env";
import type { PaidPlan } from "@/lib/billing";

/** Entitlement identifiers expected in the RevenueCat dashboard. */
export const RC_ENTITLEMENTS = {
  pro: "pro",
  premium: "premium",
  enterprise: "enterprise",
  unlimited: "unlimited",
} as const;

function normalizeIds(ids: string[] | null | undefined): string[] {
  return (ids ?? [])
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
}

function planRank(plan: PaidPlan | "FREE"): number {
  switch (plan) {
    case "UNLIMITED":
      return 3;
    case "ENTERPRISE":
      return 2;
    case "PRO":
      return 1;
    default:
      return 0;
  }
}

/** Infer plan from a single identifier (entitlement or product id / title). */
export function planFromIdentifier(raw: string): PaidPlan | "FREE" {
  const id = raw.trim().toLowerCase();
  if (!id) return "FREE";
  if (id.includes("unlimited") || id === RC_ENTITLEMENTS.unlimited) {
    return "UNLIMITED";
  }
  if (
    id.includes("premium") ||
    id.includes("enterprise") ||
    id === RC_ENTITLEMENTS.premium ||
    id === RC_ENTITLEMENTS.enterprise
  ) {
    return "ENTERPRISE";
  }
  if (
    (id.includes("pro") && !id.includes("premium")) ||
    id === RC_ENTITLEMENTS.pro ||
    id === "bookai_pro"
  ) {
    return "PRO";
  }
  return "FREE";
}

export function planFromEntitlements(
  entitlementIds: string[] | null | undefined
): PaidPlan | "FREE" {
  let best: PaidPlan | "FREE" = "FREE";
  for (const id of normalizeIds(entitlementIds)) {
    const plan = planFromIdentifier(id);
    if (planRank(plan) > planRank(best)) best = plan;
  }
  return best;
}

export function planFromRevenueCatSignals(input: {
  entitlements?: string[] | null;
  productIds?: string[] | null;
  requestedPlan?: string | null;
}): PaidPlan | "FREE" {
  let best = planFromEntitlements(input.entitlements);

  for (const id of normalizeIds(input.productIds)) {
    const plan = planFromIdentifier(id);
    if (planRank(plan) > planRank(best)) best = plan;
  }

  // Purchase just succeeded but products aren't attached to named entitlements
  // yet — honor the plan the user bought in the app.
  if (best === "FREE" && input.requestedPlan) {
    const requested = input.requestedPlan.toUpperCase();
    if (
      requested === "PRO" ||
      requested === "ENTERPRISE" ||
      requested === "UNLIMITED"
    ) {
      best = requested;
    }
  }

  return best;
}

export async function applyPlanFromRevenueCat(
  userId: string,
  entitlementIds: string[] | null | undefined,
  options?: {
    allowDowngrade?: boolean;
    productIds?: string[] | null;
    requestedPlan?: string | null;
  }
) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const plan = planFromRevenueCatSignals({
    entitlements: entitlementIds,
    productIds: options?.productIds,
    requestedPlan: options?.requestedPlan,
  });
  const allowDowngrade = options?.allowDowngrade ?? true;

  // Don't clobber an active Stripe subscription with an empty RC state.
  if (plan === "FREE") {
    if (user.stripeSubId) {
      return {
        skipped: true as const,
        reason: "stripe_active",
        plan: user.plan,
      };
    }
    if (!allowDowngrade) {
      return {
        skipped: true as const,
        reason: "downgrade_disabled",
        plan: user.plan,
      };
    }
    const updated = await db.user.update({
      where: { id: userId },
      data: {
        plan: "FREE",
        pagesLimit: PLANS.FREE.pagesLimit,
        audioMinutesLimit: PLANS.FREE.audioMinutesLimit,
        trialEndsAt: null,
      },
      select: {
        plan: true,
        pagesLimit: true,
        audioMinutesLimit: true,
        trialEndsAt: true,
      },
    });
    return { skipped: false as const, ...updated };
  }

  const config = PLANS[plan];
  const updated = await db.user.update({
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
      audioMinutesLimit: true,
      trialEndsAt: true,
    },
  });
  return { skipped: false as const, ...updated };
}

/** Resolve BookAI user id from RevenueCat app_user_id / aliases. */
export async function resolveUserIdFromRevenueCat(ids: string[]) {
  const candidates = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (candidates.length === 0) return null;

  const byId = await db.user.findFirst({
    where: { id: { in: candidates } },
    select: { id: true },
  });
  if (byId) return byId.id;

  const byEmail = await db.user.findFirst({
    where: { email: { in: candidates, mode: "insensitive" } },
    select: { id: true },
  });
  return byEmail?.id ?? null;
}

/**
 * Optionally verify entitlements against RevenueCat REST API when a secret key
 * is configured. Returns null if verification is unavailable.
 */
export async function fetchSubscriberEntitlements(appUserId: string) {
  const secret = cleanEnv(process.env.REVENUECAT_SECRET_API_KEY);
  if (!secret) return null;

  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
    {
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );
  if (!res.ok) {
    throw new Error(`RevenueCat subscriber fetch failed (${res.status})`);
  }
  const data = (await res.json()) as {
    subscriber?: {
      entitlements?: Record<string, { expires_date?: string | null }>;
      subscriptions?: Record<string, { expires_date?: string | null }>;
    };
  };
  const entitlements = data.subscriber?.entitlements ?? {};
  const now = Date.now();
  return Object.entries(entitlements)
    .filter(([, value]) => {
      if (!value?.expires_date) return true;
      return new Date(value.expires_date).getTime() > now;
    })
    .map(([id]) => id);
}

export async function fetchSubscriberProductIds(appUserId: string) {
  const secret = cleanEnv(process.env.REVENUECAT_SECRET_API_KEY);
  if (!secret) return null;

  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
    {
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );
  if (!res.ok) {
    throw new Error(`RevenueCat subscriber fetch failed (${res.status})`);
  }
  const data = (await res.json()) as {
    subscriber?: {
      subscriptions?: Record<string, { expires_date?: string | null }>;
    };
  };
  const subscriptions = data.subscriber?.subscriptions ?? {};
  const now = Date.now();
  return Object.entries(subscriptions)
    .filter(([, value]) => {
      if (!value?.expires_date) return true;
      return new Date(value.expires_date).getTime() > now;
    })
    .map(([id]) => id);
}
