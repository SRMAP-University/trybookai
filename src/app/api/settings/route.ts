import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isModelAvailable } from "@/lib/ai-models";
import {
  syncUserTrialState,
  isTrialActive,
  isStripeBillingEnabled,
} from "@/lib/billing";
import { syncUserSubscriptionFromStripe } from "@/lib/stripe-sync";
import { z } from "zod";

const settingsSchema = z.object({
  name: z.string().max(100).optional(),
  defaultGenre: z.string().optional(),
  defaultTone: z.string().optional(),
  defaultAudience: z.string().max(200).optional(),
  defaultTargetPages: z.coerce.number().min(3).max(1000).optional(),
  defaultPov: z.string().optional(),
  defaultTense: z.string().optional(),
  defaultLanguage: z.string().optional(),
  defaultModel: z.string().optional(),
  defaultCreativity: z.coerce.number().min(0).max(2).optional(),
  defaultWordsPerPage: z.coerce.number().min(150).max(500).optional(),
  defaultSectionsPerChapter: z.coerce.number().min(2).max(8).optional(),
  styleGuide: z.string().max(5000).nullable().optional(),
  autoGenerateOnCreate: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
});

const settingsSelect = {
  id: true,
  name: true,
  email: true,
  plan: true,
  pagesUsed: true,
  pagesLimit: true,
  audioMinutesUsed: true,
  audioMinutesLimit: true,
  stripeCustomerId: true,
  stripeSubId: true,
  trialEndsAt: true,
  trialStartedAt: true,
  hasUsedPremiumTrial: true,
  defaultGenre: true,
  defaultTone: true,
  defaultAudience: true,
  defaultTargetPages: true,
  defaultPov: true,
  defaultTense: true,
  defaultLanguage: true,
  defaultModel: true,
  defaultCreativity: true,
  defaultWordsPerPage: true,
  defaultSectionsPerChapter: true,
  styleGuide: true,
  autoGenerateOnCreate: true,
  emailNotifications: true,
} as const;

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await syncUserTrialState(session.user.id);

    let user = await db.user.findUnique({
      where: { id: session.user.id },
      select: settingsSelect,
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Keep local plan in sync with Stripe (upgrade OR revoke after failed payment)
    const hasStripeLink = Boolean(user.stripeCustomerId || user.stripeSubId);
    const looksFree =
      user.plan === "FREE" ||
      user.pagesLimit <= 50 ||
      user.audioMinutesLimit <= 0;
    const looksPaidWithoutProof =
      (user.plan === "PRO" || user.plan === "ENTERPRISE") && hasStripeLink;

    if (
      isStripeBillingEnabled() &&
      (looksFree || looksPaidWithoutProof)
    ) {
      try {
        const synced = await syncUserSubscriptionFromStripe(session.user.id);
        if (synced.synced) {
          const refreshed = await db.user.findUnique({
            where: { id: session.user.id },
            select: settingsSelect,
          });
          if (refreshed) user = refreshed;
        }
      } catch (error) {
        console.error("[settings GET] stripe sync", error);
      }
    }

    const { stripeCustomerId, stripeSubId, ...safeUser } = user;

    return NextResponse.json({
      ...safeUser,
      onTrial: isTrialActive(user),
      stripeBillingEnabled: isStripeBillingEnabled(),
      hasStripeCustomer: Boolean(stripeCustomerId),
      hasStripeSubscription: Boolean(stripeSubId),
    });
  } catch (error) {
    console.error("[settings GET]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load settings",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = settingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid settings", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (
      parsed.data.defaultModel &&
      !isModelAvailable(parsed.data.defaultModel, user.plan)
    ) {
      return NextResponse.json(
        { error: "This model requires a Pro or Enterprise plan." },
        { status: 403 }
      );
    }

    const data = { ...parsed.data };
    if (data.name === "") delete data.name;

    const updated = await db.user.update({
      where: { id: session.user.id },
      data,
      select: settingsSelect,
    });

    const { stripeCustomerId, stripeSubId, ...safeUser } = updated;

    return NextResponse.json({
      ...safeUser,
      onTrial: isTrialActive(updated),
      stripeBillingEnabled: isStripeBillingEnabled(),
      hasStripeCustomer: Boolean(stripeCustomerId),
      hasStripeSubscription: Boolean(stripeSubId),
    });
  } catch (error) {
    console.error("[settings PATCH]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save settings",
      },
      { status: 500 }
    );
  }
}
