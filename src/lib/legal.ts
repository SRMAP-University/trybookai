import { z } from "zod";

export const SUPPORT_EMAIL = "support@trybookai.com";

export const LEGAL = {
  terms: "/terms",
  privacy: "/privacy",
  refund: "/refund",
} as const;

export const legalConsentField = z.literal(true, {
  message:
    "You must accept the Terms of Service, Privacy Policy, and Refund Policy.",
});
