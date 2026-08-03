import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { legalConsentField } from "@/lib/legal";
import { signMobileToken } from "@/lib/mobile-auth";
import { sendWelcomeEmail } from "@/lib/emails/transactional";

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  acceptedTerms: legalConsentField,
});

/** POST /api/mobile/auth/register */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const message =
      flat.fieldErrors.acceptedTerms?.[0] ??
      flat.formErrors[0] ??
      "Invalid registration data";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "Email already registered" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await db.user.create({
    data: {
      name: parsed.data.name.trim(),
      email,
      passwordHash,
    },
  });

  sendWelcomeEmail({ to: user.email, name: user.name }).catch((error) => {
    console.error("[mobile register] welcome email", error);
  });

  const token = await signMobileToken({
    sub: user.id,
    email: user.email,
    name: user.name,
  });

  return NextResponse.json(
    {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        plan: user.plan,
        pagesUsed: user.pagesUsed,
        pagesLimit: user.pagesLimit,
        audioMinutesUsed: user.audioMinutesUsed,
        audioMinutesLimit: user.audioMinutesLimit,
        onTrial: false,
        trialEndsAt: null,
        hasUsedPremiumTrial: user.hasUsedPremiumTrial,
        hasStripeSubscription: false,
      },
    },
    { status: 201 }
  );
}
