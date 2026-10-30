import { isTrialActive } from "@/lib/billing";

/** The user fields the phone app gets back when it signs in. */
export const mobileUserSelect = {
  id: true,
  email: true,
  name: true,
  image: true,
  plan: true,
  pagesUsed: true,
  pagesLimit: true,
  audioMinutesUsed: true,
  audioMinutesLimit: true,
  trialEndsAt: true,
  hasUsedPremiumTrial: true,
  stripeSubId: true,
} as const;

export function mobileUserPayload(user: {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  plan: string;
  pagesUsed: number;
  pagesLimit: number;
  audioMinutesUsed: number;
  audioMinutesLimit: number;
  trialEndsAt: Date | null;
  hasUsedPremiumTrial: boolean;
  stripeSubId: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    plan: user.plan,
    pagesUsed: user.pagesUsed,
    pagesLimit: user.pagesLimit,
    audioMinutesUsed: user.audioMinutesUsed,
    audioMinutesLimit: user.audioMinutesLimit,
    onTrial: isTrialActive(user),
    trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
    hasUsedPremiumTrial: user.hasUsedPremiumTrial,
    hasStripeSubscription: Boolean(user.stripeSubId),
  };
}
