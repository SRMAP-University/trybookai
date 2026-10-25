import { PLANS, type BillingInterval } from "@/lib/constants";
import { normalizeCountryCode } from "@/lib/country-display";
import type { PaidPlan } from "@/lib/billing";

export type PricingRegion = "DEFAULT" | "IN";

export type RegionalPricing = {
  region: PricingRegion;
  currency: "USD" | "INR";
  symbol: string;
  /** Price per plan and interval; null means it isn't sold in this region. */
  plans: Record<PaidPlan, Record<BillingInterval, number | null>>;
};

/**
 * Subscription prices by region. India pays rupees for Pro and Premium
 * (monthly only); everywhere else pays the USD prices in PLANS.
 * Mobile keeps a copy of this table in `mobile/lib/config/plan_pricing.dart`.
 */
export const REGIONAL_PRICING: Record<PricingRegion, RegionalPricing> = {
  DEFAULT: {
    region: "DEFAULT",
    currency: "USD",
    symbol: "$",
    plans: {
      PRO: { month: PLANS.PRO.price, year: PLANS.PRO.yearlyPrice },
      ENTERPRISE: {
        month: PLANS.ENTERPRISE.price,
        year: PLANS.ENTERPRISE.yearlyPrice,
      },
      UNLIMITED: {
        month: PLANS.UNLIMITED.price,
        year: PLANS.UNLIMITED.yearlyPrice,
      },
    },
  },
  IN: {
    region: "IN",
    currency: "INR",
    symbol: "₹",
    plans: {
      PRO: { month: 200, year: null },
      ENTERPRISE: { month: 1390, year: null },
      UNLIMITED: { month: null, year: null },
    },
  },
};

export function pricingRegionForCountry(
  country: string | null | undefined
): PricingRegion {
  return normalizeCountryCode(country) === "IN" ? "IN" : "DEFAULT";
}

export function regionalPrice(
  pricing: RegionalPricing,
  plan: PaidPlan,
  interval: BillingInterval
): number | null {
  return pricing.plans[plan][interval];
}

export function hasYearlyPricing(pricing: RegionalPricing): boolean {
  return Object.values(pricing.plans).some((prices) => prices.year !== null);
}

/** "$20", "₹1,390" */
export function formatRegionalPrice(pricing: RegionalPricing, amount: number) {
  const locale = pricing.currency === "INR" ? "en-IN" : "en-US";
  return `${pricing.symbol}${amount.toLocaleString(locale)}`;
}
