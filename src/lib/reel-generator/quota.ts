import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { PLANS, PREMIUM_TRIAL } from "@/lib/constants";
import { isTrialActive } from "@/lib/billing";
import {
  FREE_SHORT_TARGET_WORDS,
  MAX_REROLLS,
  SHORT_TARGET_WORDS,
  type ReelAllowance,
} from "@/lib/reel-generator/types";

/**
 * Reel minutes are their own monthly allowance, separate from audiobook
 * minutes and counted in seconds. Usage is the narration billed to reels
 * created this calendar month (UTC), so it resets on its own.
 */

type QuotaUser = { plan: string; trialEndsAt: Date | null };

/** A reel may run this far past the allowance rather than fail after narration was paid for. */
export const REEL_OVERAGE_SECONDS = 10;

export function reelAllowanceSeconds(user: QuotaUser): number {
  if (isTrialActive(user)) return PREMIUM_TRIAL.reelMinutesLimit * 60;
  const plan = PLANS[user.plan as keyof typeof PLANS] ?? PLANS.FREE;
  return plan.reelMinutesLimit * 60;
}

/** Visual Audiobook is Premium (ENTERPRISE in code) and Unlimited only. */
export function canUseVisualAudiobook(user: { plan: string }): boolean {
  return user.plan === "ENTERPRISE" || user.plan === "UNLIMITED";
}

export function isFreeReelUser(user: { plan: string }): boolean {
  return user.plan === "FREE";
}

export function shortWordsFor(user: { plan: string }): number {
  return isFreeReelUser(user) ? FREE_SHORT_TARGET_WORDS : SHORT_TARGET_WORDS;
}

export function maxRerollsFor(user: { plan: string }): number {
  return isFreeReelUser(user) ? MAX_REROLLS.free : MAX_REROLLS.paid;
}

export function reelMonthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function reelSecondsUsed(
  userId: string,
  client: Prisma.TransactionClient | typeof db = db
): Promise<number> {
  const result = await client.storyReel.aggregate({
    where: { userId, createdAt: { gte: reelMonthStart() } },
    _sum: { billedSeconds: true },
  });
  return result._sum.billedSeconds ?? 0;
}

export async function getReelAllowance(userId: string): Promise<ReelAllowance> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plan: true, trialEndsAt: true },
  });
  const limitSeconds = reelAllowanceSeconds(user);
  const usedSeconds = await reelSecondsUsed(userId);
  return {
    limitSeconds,
    usedSeconds,
    remainingSeconds: Math.max(0, limitSeconds - usedSeconds),
    shortWords: shortWordsFor(user),
    canUseVisualAudiobook: canUseVisualAudiobook(user),
    maxRerolls: maxRerollsFor(user),
    isFree: isFreeReelUser(user),
  };
}
