import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { legalConsentField } from "@/lib/legal";
import { signMobileToken } from "@/lib/mobile-auth";
import { sendWelcomeEmail } from "@/lib/emails/transactional";
import { isTrialActive } from "@/lib/billing";
import { persistUserCountryFromRequest } from "@/lib/geo";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(100),
});

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  acceptedTerms: legalConsentField,
});

function userPayload(user: {
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
  stripeCustomerId: string | null;
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

const userSelect = {
  id: true,
  email: true,
  name: true,
  image: true,
  passwordHash: true,
  plan: true,
  pagesUsed: true,
  pagesLimit: true,
  audioMinutesUsed: true,
  audioMinutesLimit: true,
  trialEndsAt: true,
  hasUsedPremiumTrial: true,
  stripeCustomerId: true,
  stripeSubId: true,
} as const;

/** POST /api/mobile/auth/login */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { email: parsed.data.email.toLowerCase().trim() },
    select: userSelect,
  });

  if (!user?.passwordHash) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await signMobileToken({
    sub: user.id,
    email: user.email,
    name: user.name,
  });

  void persistUserCountryFromRequest(user.id, request);

  return NextResponse.json({
    token,
    user: userPayload(user),
  });
}
