import { PREMIUM_TRIAL } from "@/lib/constants";

/** Separate Checkout line items (Included · …) — one row each. */
export const STRIPE_PREMIUM_INCLUDED_ADDONS = [
  "10,000 pages per month",
  "3 hours of audiobook narration",
  "Audiobook, podcast & theme music",
  "Qwen 32B premium model access",
  "Up to 1,000 pages per book",
  "Unlimited books",
  "Private books",
  "Custom styles & voices",
  "Priority generation & support",
] as const;

export const STRIPE_PRO_INCLUDED_ADDONS = [
  "5,000 pages per month",
  "1 hour of audiobook narration",
  "Audiobook, podcast & theme music",
  "Up to 500 pages per book",
  "Private books",
  "Priority generation",
  "PDF & EPUB export",
] as const;

/** Pricing-table / marketing list (includes trial callout). */
export const STRIPE_PREMIUM_MARKETING_FEATURES = [
  ...STRIPE_PREMIUM_INCLUDED_ADDONS,
  `${PREMIUM_TRIAL.days}-day free trial at checkout`,
] as const;

export const STRIPE_PRO_MARKETING_FEATURES = [
  ...STRIPE_PRO_INCLUDED_ADDONS,
] as const;

/** Short blurb only — Checkout flattens long descriptions into one paragraph. */
export function premiumProductDescription() {
  return "High-volume writing with audiobook narration, Qwen 32B, and priority support.";
}

export function proProductDescription() {
  return "Monthly pages, audiobook narration, private books, and priority generation.";
}

export function featureLookupKey(
  plan: "PRO" | "ENTERPRISE",
  feature: string,
  interval: "month" | "year"
) {
  const slug = feature
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return `bookai_${plan.toLowerCase()}_${slug}_${interval}`;
}
