import { PLANS, PREMIUM_TRIAL } from "@/lib/constants";

type PaidPlan = "PRO" | "ENTERPRISE";

/** One-time capacity packs — charged immediately via Checkout (mode: payment). */
export const ADDONS = {
  PAGES: {
    key: "pages" as const,
    name: "Extra 1,000 pages",
    description: "One-time · +1,000 page credits",
    unitPrice: 2,
    pagesPerUnit: 1000,
    audioMinutesPerUnit: 0,
    priceId: () => process.env.STRIPE_PAGES_ADDON_PRICE_ID,
  },
  AUDIO: {
    key: "audio" as const,
    name: "Extra 1 hour audiobook",
    description: "One-time · +60 minutes of narration",
    unitPrice: 15,
    pagesPerUnit: 0,
    audioMinutesPerUnit: 60,
    priceId: () => process.env.STRIPE_AUDIO_ADDON_PRICE_ID,
  },
} as const;

export type AddonKey = keyof typeof ADDONS;

export function addonPriceId(key: AddonKey) {
  return ADDONS[key].priceId();
}

export function knownAddonPriceIds(): Set<string> {
  return new Set(
    [
      process.env.STRIPE_PAGES_ADDON_PRICE_ID,
      process.env.STRIPE_AUDIO_ADDON_PRICE_ID,
      // legacy recurring ids (ignore if still on old subs)
      process.env.STRIPE_PAGES_ADDON_YEARLY_PRICE_ID,
      process.env.STRIPE_AUDIO_ADDON_YEARLY_PRICE_ID,
    ].filter((id): id is string => Boolean(id))
  );
}

export function isPagesAddonPrice(priceId: string) {
  return (
    priceId === process.env.STRIPE_PAGES_ADDON_PRICE_ID ||
    priceId === process.env.STRIPE_PAGES_ADDON_YEARLY_PRICE_ID
  );
}

export function isAudioAddonPrice(priceId: string) {
  return (
    priceId === process.env.STRIPE_AUDIO_ADDON_PRICE_ID ||
    priceId === process.env.STRIPE_AUDIO_ADDON_YEARLY_PRICE_ID
  );
}

export function capacityFromQuantities(pagesQty: number, audioQty: number) {
  return {
    pagesBonus: Math.max(0, pagesQty) * ADDONS.PAGES.pagesPerUnit,
    audioMinutesBonus: Math.max(0, audioQty) * ADDONS.AUDIO.audioMinutesPerUnit,
  };
}

export function limitsFromPlanAndBonuses({
  plan,
  isTrialing,
  pagesBonus = 0,
  audioMinutesBonus = 0,
}: {
  plan: PaidPlan;
  isTrialing: boolean;
  pagesBonus?: number;
  audioMinutesBonus?: number;
}) {
  const basePages = isTrialing
    ? PREMIUM_TRIAL.pagesLimit
    : PLANS[plan].pagesLimit;
  const baseAudio = isTrialing
    ? PREMIUM_TRIAL.audioMinutesLimit
    : PLANS[plan].audioMinutesLimit;

  if (isTrialing) {
    return {
      pagesLimit: basePages,
      audioMinutesLimit: baseAudio,
      pagesBonus: 0,
      audioMinutesBonus: 0,
    };
  }

  return {
    pagesLimit: basePages + Math.max(0, pagesBonus),
    audioMinutesLimit: baseAudio + Math.max(0, audioMinutesBonus),
    pagesBonus: Math.max(0, pagesBonus),
    audioMinutesBonus: Math.max(0, audioMinutesBonus),
  };
}
