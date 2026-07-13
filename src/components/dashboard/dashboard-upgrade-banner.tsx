"use client";

import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UpgradeButton } from "@/components/dashboard/upgrade-button";
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
        body: JSON.stringify({ action: "start" }),
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
      <div className="relative overflow-hidden rounded-xl border border-[#f0e0a8] bg-linear-to-br from-[#fffbeb] to-white p-6">
        <span className="inline-flex items-center gap-1 rounded-full bg-[#fcf5e0] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#9a6700]">
          <Sparkles className="h-3 w-3" />
          Free trial
        </span>
        <h2 className="mt-3 text-[22px] font-semibold tracking-[-0.03em] text-[#0a2540]">
          Try Premium free for {PREMIUM_TRIAL.days} days
        </h2>
        <p className="mt-2 max-w-[340px] text-[13px] leading-relaxed text-[#425466]">
          Get {PREMIUM_TRIAL.pagesLimit} pages and{" "}
          {PREMIUM_TRIAL.audioMinutesLimit} min of audiobook narration. Starts
          as a Stripe trial, then Premium billing.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            className="h-9 rounded-md bg-[#0e6245] px-4 text-[13px] hover:bg-[#0a4d37]"
            onClick={startTrial}
            disabled={trialLoading}
          >
            {trialLoading ? "Starting…" : "Start free trial · $0 today"}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
          <Link
            href="/dashboard/billing"
            className="text-[12px] font-medium text-[#635bff] hover:underline"
          >
            Or upgrade to Pro
          </Link>
        </div>
        <p className="mt-3 text-[12px] text-[#697386]">
          {pagesRemaining} free pages left on your current plan
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#e6ebf1] bg-linear-to-br from-[#f0efff] to-white p-6">
      <h2 className="text-[22px] font-semibold tracking-[-0.03em] text-[#0a2540]">
        Unlock more pages & audiobooks
      </h2>
      <p className="mt-2 max-w-[320px] text-[13px] leading-relaxed text-[#425466]">
        Pro includes 5,000 pages, 1 hour of narration, and priority generation.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <UpgradeButton
          plan="PRO"
          className="h-9 rounded-md bg-[#635bff] px-4 text-[13px] hover:bg-[#5851e5]"
        >
          Upgrade to Pro
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </UpgradeButton>
        <span className="text-[12px] text-[#697386]">
          {pagesRemaining} free pages left
        </span>
      </div>
    </div>
  );
}
