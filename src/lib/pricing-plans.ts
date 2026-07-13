import type { CSSProperties } from "react";

export const PRICING_PLANS = [
  {
    key: "FREE" as const,
    highlight: false,
    description: "For trying BookAI and short drafts.",
    featuresLabel: "Free, forever",
    headerFrom: "#fff4ec",
  },
  {
    key: "PRO" as const,
    highlight: true,
    description: "For authors shipping books and audiobooks every month.",
    featuresLabel: "Free plan features, plus:",
    headerFrom: "#eef0ff",
  },
  {
    key: "ENTERPRISE" as const,
    highlight: false,
    description:
      "Maximum page and audio limits for authors and publishers.",
    featuresLabel: "Pro features, plus:",
    headerFrom: "#eaf8f4",
  },
] as const;

export const PRICING_FEATURES: Record<string, string[]> = {
  FREE: [
    "50 pages per month",
    "1 book at a time",
    "Basic genres",
    "PDF export",
    "Public books (SEO)",
  ],
  PRO: [
    "5,000 pages per month",
    "1 hour of audiobook narration",
    "Up to 500 pages per book",
    "Private books",
    "Priority generation",
    "PDF & EPUB export",
  ],
  ENTERPRISE: [
    "10,000 pages per month",
    "3 hours of audiobook narration",
    "Up to 1,000 pages per book",
    "Unlimited books",
    "Priority support",
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
