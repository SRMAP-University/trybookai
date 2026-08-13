import type { CSSProperties } from "react";

/** Paid plans shown as pricing cards. */
export const PRICING_PLANS = [
  {
    key: "PRO" as const,
    highlight: false,
    description: "For authors shipping books and audiobooks every month.",
    featuresLabel: "Free plan features, plus:",
    headerFrom: "#eef0ff",
  },
  {
    key: "ENTERPRISE" as const,
    highlight: true,
    description:
      "Maximum page and audio limits for authors and publishers.",
    featuresLabel: "Pro features, plus:",
    headerFrom: "#eaf8f4",
  },
  {
    key: "UNLIMITED" as const,
    highlight: false,
    description:
      "Everything unlimited for power users — fair use & rate limits apply.",
    featuresLabel: "Premium features, plus:",
    headerFrom: "#f3eefc",
  },
] as const;

export const FREE_PLAN_BANNER = {
  key: "FREE" as const,
  description: "For trying BookAI and short drafts.",
  features: [
    "50 pages per month",
    "1 book at a time",
    "Basic genres",
    "PDF export",
    "Public books (SEO)",
  ],
} as const;

export const PRICING_FEATURES: Record<string, string[]> = {
  FREE: [...FREE_PLAN_BANNER.features],
  PRO: [
    "5,000 pages per month",
    "1 hour of audiobook narration",
    "Up to 500 pages per book",
    "Private books",
    "Super Fast generation",
    "PDF & EPUB export",
  ],
  ENTERPRISE: [
    "10,000 pages per month",
    "3 hours of audiobook narration",
    "Up to 1,000 pages per book",
    "Unlimited books",
    "Super Fast generation",
    "Priority support",
  ],
  UNLIMITED: [
    "Unlimited pages*",
    "Unlimited audiobook narration*",
    "Up to 5,000 pages per book",
    "All models, voices & Audio Studio",
    "Highest generation priority",
    "Priority support",
    "*Fair use & rate limits apply",
  ],
};

export function pricingHeaderStyle(from: string): CSSProperties {
  return {
    backgroundImage: [
      "linear-gradient(rgba(10,37,64,0.04) 1px, transparent 1px)",
      "linear-gradient(90deg, rgba(10,37,64,0.04) 1px, transparent 1px)",
      `linear-gradient(180deg, ${from} 0%, #ffffff 72%)`,
    ].join(", "),
    backgroundSize: "22px 22px, 22px 22px, auto",
  };
}
