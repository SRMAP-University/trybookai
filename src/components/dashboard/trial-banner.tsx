"use client";

import Link from "next/link";
import { Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PREMIUM_TRIAL } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function isClientTrialActive(
  trialEndsAt?: string | Date | null,
  onTrial?: boolean
) {
  if (onTrial) return true;
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt).getTime() > Date.now();
}

export function formatTrialCountdown(endsAt?: string | Date | null) {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const totalHours = Math.ceil(ms / (1000 * 60 * 60));
  if (totalHours < 24) {
    return `${totalHours} hour${totalHours === 1 ? "" : "s"} left`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (hours === 0) return `${days} day${days === 1 ? "" : "s"} left`;
  return `${days}d ${hours}h left`;
}

type TrialBannerProps = {
  trialEndsAt?: string | Date | null;
  pagesUsed: number;
  pagesLimit: number;
  audioMinutesUsed: number;
  audioMinutesLimit: number;
  className?: string;
  onEndTrial?: () => void;
  ending?: boolean;
};

export function TrialBanner({
  trialEndsAt,
  pagesUsed,
  pagesLimit,
  audioMinutesUsed,
  audioMinutesLimit,
  className,
  onEndTrial,
  ending,
}: TrialBannerProps) {
  const remaining = formatTrialCountdown(trialEndsAt);
  const pagePct =
    pagesLimit > 0
      ? Math.min(100, Math.round((pagesUsed / pagesLimit) * 100))
      : 0;
  const audioPct =
    audioMinutesLimit > 0
      ? Math.min(100, Math.round((audioMinutesUsed / audioMinutesLimit) * 100))
      : 0;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-[#f0e0a8] bg-linear-to-br from-[#fffbeb] via-white to-[#f6f9fc]",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#fcf5e0] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#9a6700]">
              <Sparkles className="h-3 w-3" />
              Free trial
            </span>
            {remaining && (
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#9a6700]">
                <Clock className="h-3.5 w-3.5" />
                {remaining}
              </span>
            )}
          </div>
          <p className="mt-2 text-[15px] font-semibold text-[#0a2540]">
            Premium trial · {PREMIUM_TRIAL.days} days
          </p>
          <p className="mt-1 max-w-[420px] text-[13px] leading-relaxed text-[#697386]">
            {PREMIUM_TRIAL.pagesLimit.toLocaleString()} pages and{" "}
            {Math.round(PREMIUM_TRIAL.audioMinutesLimit / 60)} hours of audio.
            Unlock full Premium to keep going after the trial.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onEndTrial && (
            <Button
              size="sm"
              className="h-8 bg-[#0e6245] text-[12px] hover:bg-[#0a4d37]"
              onClick={onEndTrial}
              disabled={ending}
            >
              {ending ? "Unlocking…" : "Unlock full Premium"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-[#e6ebf1] text-[12px]"
            asChild
          >
            <Link href="/dashboard/billing">Billing</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 border-t border-[#f0e0a8]/70 bg-white/60 px-5 py-3 sm:grid-cols-2">
        <div>
          <div className="flex justify-between text-[11px] text-[#697386]">
            <span>Pages</span>
            <span className="tabular-nums">
              {pagesUsed}/{pagesLimit}
            </span>
          </div>
          <Progress value={pagePct} className="mt-1.5 h-1.5" />
        </div>
        <div>
          <div className="flex justify-between text-[11px] text-[#697386]">
            <span>Audiobook</span>
            <span className="tabular-nums">
              {audioMinutesUsed}/{audioMinutesLimit} min
            </span>
          </div>
          <Progress value={audioPct} className="mt-1.5 h-1.5" />
        </div>
      </div>
    </div>
  );
}
