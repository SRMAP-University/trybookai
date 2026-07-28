"use client";

import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UpgradeButton } from "@/components/dashboard/upgrade-button";
import { LegalClickAgreement } from "@/components/legal/legal-consent";
import { useDashboardUser } from "@/components/dashboard/user-context";
import { PREMIUM_TRIAL } from "@/lib/constants";
import { readJson } from "@/lib/api";
import { toast } from "sonner";

type DashboardUpgradeBannerProps = {
  pagesRemaining: number;
};

export function DashboardUpgradeBanner({
  pagesRemaining,
}: DashboardUpgradeBannerProps) {
  const { user, refresh } = useDashboardUser();
  const [trialLoading, setTrialLoading] = useState(false);
  const canStartTrial = !user?.hasStripeSubscription && !user?.onTrial;

  async function startTrial() {
    setTrialLoading(true);
    try {
      const res = await fetch("/api/billing/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", acceptedTerms: true }),
      });
      const result = await readJson<{
        error?: string;
        message?: string;
        url?: string;
      }>(res);
      if (!result.ok) throw new Error(result.error);
      if (result.data.url) {
        toast.message(result.data.message ?? "Continue in Stripe…");
        window.location.href = result.data.url;
        return;
      }
      toast.success(result.data.message ?? "Premium trial started");
      refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not start trial"
      );
    } finally {
      setTrialLoading(false);
    }
  }

  if (canStartTrial) {
    return (
      <div className="relative overflow-hidden rounded-lg border border-[#f0e0a8] bg-linear-to-br from-[#fffbeb] to-white px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#9a6700]">
              <Sparkles className="h-2.5 w-2.5" />
              Free trial · {PREMIUM_TRIAL.days} days
            </span>
            <h2 className="mt-0.5 text-[15px] font-semibold tracking-[-0.02em] text-[#0a2540]">
              Try Premium free
            </h2>
            <p className="mt-0.5 text-[12px] leading-snug text-[#697386]">
              {PREMIUM_TRIAL.pagesLimit.toLocaleString()} pages ·{" "}
              {Math.round(PREMIUM_TRIAL.audioMinutesLimit / 60)}h audio · $0
              today · {pagesRemaining} free left
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Button
              className="h-7 rounded-md bg-[#0e6245] px-3 text-[12px] hover:bg-[#0a4d37]"
              onClick={startTrial}
              disabled={trialLoading}
            >
              {trialLoading ? "Starting…" : "Start trial"}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
            <Link
              href="/dashboard/billing"
              className="text-[11px] font-medium text-[#635bff] hover:underline"
            >
              Or upgrade to Pro
            </Link>
          </div>
        </div>
        <LegalClickAgreement
          className="mt-2"
          actionLabel="By starting a trial"
        />
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-[#e6ebf1] bg-linear-to-br from-[#f0efff] to-white px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[#0a2540]">
            Unlock more pages & audiobooks
          </h2>
          <p className="mt-0.5 text-[12px] leading-snug text-[#697386]">
            Pro: 5,000 pages · 1h narration · {pagesRemaining} free left
          </p>
        </div>
        <UpgradeButton
          plan="PRO"
          className="h-7 shrink-0 rounded-md bg-[#635bff] px-3 text-[12px] hover:bg-[#5851e5]"
        >
          Upgrade to Pro
          <ArrowRight className="ml-1 h-3 w-3" />
        </UpgradeButton>
      </div>
    </div>
  );
}
