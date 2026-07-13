import Stripe from "stripe";
import { PREMIUM_TRIAL } from "@/lib/constants";
import { addonPriceId } from "@/lib/addons";
import { cleanEnv } from "@/lib/env";
import {
  featureLookupKey,
  premiumProductDescription,
  proProductDescription,
  STRIPE_PREMIUM_INCLUDED_ADDONS,
  STRIPE_PREMIUM_MARKETING_FEATURES,
  STRIPE_PRO_INCLUDED_ADDONS,
  STRIPE_PRO_MARKETING_FEATURES,
} from "@/lib/stripe-catalog";

let stripeInstance: Stripe | null = null;

export function getStripe() {
  if (!stripeInstance) {
    const key = cleanEnv(process.env.STRIPE_SECRET_KEY);
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    stripeInstance = new Stripe(key, {
      typescript: true,
    });
  }
  return stripeInstance;
}

/** Stripe requires trial_end ≥ ~2 days from now. */
export function premiumTrialEndUnix(days: number = PREMIUM_TRIAL.days): number {
  const safeDays = Math.max(2, Math.ceil(days));
  // +1 hour buffer so Stripe never rejects "must be at least 2 days"
  return Math.floor(Date.now() / 1000) + safeDays * 24 * 60 * 60 + 3600;
}

const syncedProducts = new Set<string>();
const includedPriceCache = new Map<string, string>();

/** Keep Stripe Product description + marketing feature list in sync. */
async function syncProductCatalog(
  priceId: string,
  plan: "PRO" | "ENTERPRISE"
) {
  if (syncedProducts.has(priceId)) return;
  const stripe = getStripe();
  const price = await stripe.prices.retrieve(priceId);
  const productId =
    typeof price.product === "string" ? price.product : price.product.id;

  const isPremium = plan === "ENTERPRISE";
  const features = isPremium
    ? STRIPE_PREMIUM_MARKETING_FEATURES
    : STRIPE_PRO_MARKETING_FEATURES;

  await stripe.products.update(productId, {
    name: isPremium ? "BookAI Premium" : "BookAI Pro",
    description: isPremium
      ? premiumProductDescription()
      : proProductDescription(),
    marketing_features: features.slice(0, 15).map((name) => ({ name })),
  });

  syncedProducts.add(priceId);
}

async function ensureIncludedFeaturePriceId(
  plan: "PRO" | "ENTERPRISE",
  feature: string,
  interval: "month" | "year"
): Promise<string> {
  const lookupKey = featureLookupKey(plan, feature, interval);
  const cached = includedPriceCache.get(lookupKey);
  if (cached) return cached;

  const stripe = getStripe();
  const existing = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  if (existing.data[0]) {
    includedPriceCache.set(lookupKey, existing.data[0].id);
    return existing.data[0].id;
  }

  const product = await stripe.products.create({
    name: `Included · ${feature}`,
    description: "Included with your BookAI plan — not an extra charge",
    metadata: {
      bookai_included_feature: "1",
      bookai_plan: plan,
      bookai_feature: feature.slice(0, 400),
    },
  });

  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: 0,
    recurring: { interval },
    lookup_key: lookupKey,
    metadata: {
      bookai_included_feature: "1",
      bookai_plan: plan,
    },
  });

  includedPriceCache.set(lookupKey, price.id);
  return price.id;
}

async function includedFeatureLineItems(
  plan: "PRO" | "ENTERPRISE",
  interval: "month" | "year"
): Promise<Stripe.Checkout.SessionCreateParams.LineItem[]> {
  const features =
    plan === "ENTERPRISE"
      ? STRIPE_PREMIUM_INCLUDED_ADDONS
      : STRIPE_PRO_INCLUDED_ADDONS;

  const priceIds = await Promise.all(
    features.map((feature) =>
      ensureIncludedFeaturePriceId(plan, feature, interval)
    )
  );

  return priceIds.map((price) => ({ price, quantity: 1 }));
}

function paidAddonLineItems(
  pagesQty: number,
  audioQty: number
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  if (pagesQty > 0) {
    const price = addonPriceId("PAGES");
    if (price) items.push({ price, quantity: pagesQty });
  }
  if (audioQty > 0) {
    const price = addonPriceId("AUDIO");
    if (price) items.push({ price, quantity: audioQty });
  }
  return items;
}

export async function createCheckoutSession({
  customerId,
  priceId,
  userId,
  successUrl,
  cancelUrl,
  trialPeriodDays,
  plan,
  pagesAddonQty = 0,
  audioAddonQty = 0,
}: {
  customerId?: string;
  priceId: string;
  userId: string;
  successUrl: string;
  cancelUrl: string;
  /** When set (≥2), subscription starts with a free trial — $0 due today. */
  trialPeriodDays?: number;
  plan?: "PRO" | "ENTERPRISE";
  pagesAddonQty?: number;
  audioAddonQty?: number;
}) {
  const stripe = getStripe();
  const withTrial = Boolean(trialPeriodDays && trialPeriodDays > 0);
  const trialEnd = withTrial
    ? premiumTrialEndUnix(trialPeriodDays!)
    : undefined;

  const resolvedPlan =
    plan ||
    (cleanEnv(priceId) === cleanEnv(process.env.STRIPE_ENTERPRISE_PRICE_ID) ||
    cleanEnv(priceId) === cleanEnv(process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID)
      ? "ENTERPRISE"
      : "PRO");

  try {
    await syncProductCatalog(priceId, resolvedPlan);
  } catch (error) {
    console.warn("[stripe] product catalog sync failed", error);
  }

  const mainPrice = await stripe.prices.retrieve(priceId);
  const interval =
    mainPrice.recurring?.interval === "year" ? "year" : "month";

  let featureItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  try {
    featureItems = await includedFeatureLineItems(resolvedPlan, interval);
  } catch (error) {
    console.warn("[stripe] included feature line items failed", error);
  }

  const capacityItems = paidAddonLineItems(
    Math.max(0, Math.floor(pagesAddonQty)),
    Math.max(0, Math.floor(audioAddonQty))
  );

  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData =
    {
      metadata: {
        userId,
        ...(withTrial ? { trial: "premium" } : {}),
      },
      description:
        resolvedPlan === "ENTERPRISE"
          ? "Premium includes audiobook narration, Qwen 32B, unlimited books, and priority support."
          : "Pro includes audiobook narration, private books, and priority generation.",
    };

  if (trialEnd) {
    subscriptionData.trial_end = trialEnd;
  }

  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      { price: priceId, quantity: 1 },
      ...featureItems,
      ...capacityItems,
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      ...(withTrial
        ? {
            trial: "premium",
            trial_days: String(Math.max(2, Math.ceil(trialPeriodDays!))),
          }
        : {}),
    },
    subscription_data: subscriptionData,
    custom_text: {
      submit: {
        message: withTrial
          ? "2-day free trial · $0 due today. “Included ·” rows are plan features (not extra charges)."
          : "“Included ·” rows are plan features at $0. Extra pages/audio are optional paid capacity.",
      },
    },
    ...(withTrial ? { payment_method_collection: "always" as const } : {}),
  });
}

export async function createCapacityCheckoutSession({
  customerId,
  userId,
  pagesQty,
  audioQty,
  successUrl,
  cancelUrl,
}: {
  customerId: string;
  userId: string;
  pagesQty: number;
  audioQty: number;
  successUrl: string;
  cancelUrl: string;
}) {
  const stripe = getStripe();
  const lineItems = paidAddonLineItems(
    Math.max(0, Math.floor(pagesQty)),
    Math.max(0, Math.floor(audioQty))
  );

  if (lineItems.length === 0) {
    throw new Error("Select at least one capacity pack to purchase.");
  }

  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      bookai_capacity: "1",
      pagesQty: String(Math.max(0, Math.floor(pagesQty))),
      audioQty: String(Math.max(0, Math.floor(audioQty))),
    },
    payment_intent_data: {
      metadata: {
        userId,
        bookai_capacity: "1",
        pagesQty: String(Math.max(0, Math.floor(pagesQty))),
        audioQty: String(Math.max(0, Math.floor(audioQty))),
      },
    },
    custom_text: {
      submit: {
        message:
          "One-time charge. Credits are added to your account right after payment.",
      },
    },
  });
}

export async function customerHasActiveSubscription(customerId: string) {
  const stripe = getStripe();
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });
  return subs.data.some(
    (s) =>
      s.status === "active" ||
      s.status === "trialing" ||
      s.status === "past_due"
  );
}

export async function endStripeSubscriptionTrial(subscriptionId: string) {
  const stripe = getStripe();
  return stripe.subscriptions.update(subscriptionId, {
    trial_end: "now",
  });
}

export async function createCustomerPortalSession({
  customerId,
  returnUrl,
}: {
  customerId: string;
  returnUrl: string;
}) {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

export async function getOrCreateStripeCustomer({
  email,
  name,
  userId,
}: {
  email: string;
  name?: string | null;
  userId: string;
}) {
  const stripe = getStripe();
  const customers = await stripe.customers.list({ email, limit: 1 });
  if (customers.data.length > 0) {
    const existing = customers.data[0];
    if (!existing.metadata?.userId) {
      await stripe.customers.update(existing.id, {
        metadata: { ...existing.metadata, userId },
      });
    }
    return existing;
  }
  return stripe.customers.create({
    email,
    name: name ?? undefined,
    metadata: { userId },
  });
}
