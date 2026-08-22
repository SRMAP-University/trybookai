import { PREMIUM_TRIAL, UNLIMITED_FAIR_USE } from "@/lib/constants";

/** Separate Checkout line items (Included · …) — one row each. */
export const STRIPE_PREMIUM_INCLUDED_ADDONS = [
  "10,000 pages per month",
  "3 hours of audiobook narration",
  "Audiobook, podcast, theme music & songs",
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
  "Audiobook, podcast, theme music & songs",
  "Up to 500 pages per book",
  "Private books",
  "Priority generation",
  "PDF & EPUB export",
] as const;

export const STRIPE_UNLIMITED_INCLUDED_ADDONS = [
  "Unlimited pages (fair use)",
  "Unlimited audiobook narration (fair use)",
  "Audiobook, podcast, theme music & songs",
  "All AI models & voices",
  "Up to 5,000 pages per book",
  "Unlimited books & Audio Studio",
  "Private books",
  "Highest generation priority",
  "Priority support",
] as const;

/** Pricing-table / marketing list (includes trial callout). */
export const STRIPE_PREMIUM_MARKETING_FEATURES = [
  ...STRIPE_PREMIUM_INCLUDED_ADDONS,
  `${PREMIUM_TRIAL.days}-day free trial · ${PREMIUM_TRIAL.pagesLimit.toLocaleString()} pages · ${Math.round(PREMIUM_TRIAL.audioMinutesLimit / 60)} hours audio`,
] as const;

export const STRIPE_PRO_MARKETING_FEATURES = [
  ...STRIPE_PRO_INCLUDED_ADDONS,
] as const;

export const STRIPE_UNLIMITED_MARKETING_FEATURES = [
  ...STRIPE_UNLIMITED_INCLUDED_ADDONS,
  `Rate limits: ${UNLIMITED_FAIR_USE.maxConcurrentBookJobs} concurrent books · ${UNLIMITED_FAIR_USE.maxNewBookJobsPerHour}/hr starts`,
  "Terms & fair-use policy apply",
] as const;

/** Short blurb only — Checkout flattens long descriptions into one paragraph. */
export function premiumProductDescription() {
  return "High-volume writing with audiobook narration, Qwen 32B, and priority support.";
}

export function proProductDescription() {
  return "Monthly pages, audiobook narration, private books, and priority generation.";
}

export function unlimitedProductDescription() {
  return "Unlimited pages and audio for serious authors — subject to fair use and rate limits.";
}

export function featureLookupKey(
  plan: "PRO" | "ENTERPRISE" | "UNLIMITED",
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
