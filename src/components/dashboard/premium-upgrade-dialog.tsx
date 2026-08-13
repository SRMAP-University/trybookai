"use client";

import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpgradePlan } from "@/components/dashboard/upgrade-button";
import { PLANS } from "@/lib/constants";
import { PRICING_FEATURES } from "@/lib/pricing-plans";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Short reason shown under the title, e.g. "Super Fast uses Groq." */
  featureLabel?: string;
};

const POPUP_PLANS = [
  {
    key: "PRO" as const,
    highlight: false,
    cta: "Upgrade to Pro",
  },
  {
    key: "ENTERPRISE" as const,
    highlight: true,
    cta: "Upgrade to Premium",
  },
];

export function PremiumUpgradeDialog({
  open,
  onOpenChange,
  featureLabel = "This feature is included on paid plans.",
}: Props) {
  const { upgrade, loading } = useUpgradePlan();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-1 border-b border-[#eef1f5] px-5 py-4 text-left">
          <DialogTitle className="text-[17px] font-semibold tracking-tight text-[#0a2540]">
            Upgrade to unlock
          </DialogTitle>
          <DialogDescription className="text-[13px] text-[#62748e]">
            {featureLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {POPUP_PLANS.map((plan) => {
            const config = PLANS[plan.key];
            const features = PRICING_FEATURES[plan.key] ?? [];
            const busy = loading === plan.key;

            return (
              <div
                key={plan.key}
                className={cn(
                  "flex flex-col rounded-xl border bg-white p-4",
                  plan.highlight
                    ? "border-[#635bff]/40 shadow-[0_8px_24px_rgba(99,91,255,0.1)]"
                    : "border-[#e6ebf1]"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-semibold text-[#0a2540]">
                      {config.name}
                    </p>
                    <p className="mt-1 flex items-baseline gap-1">
                      <span className="text-[28px] font-bold tracking-tight text-[#0a2540]">
                        ${config.price}
                      </span>
                      <span className="text-[12px] text-[#697386]">/mo</span>
                    </p>
                  </div>
                  {plan.highlight && (
                    <span className="rounded-full bg-[#635bff] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Popular
                    </span>
                  )}
                </div>

                <ul className="mt-3 flex-1 space-y-2">
                  {features.slice(0, 5).map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-[12.5px] leading-snug text-[#425466]"
                    >
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0a2540]" />
                      {item}
                    </li>
                  ))}
                </ul>

                <Button
                  type="button"
                  disabled={Boolean(loading)}
                  onClick={() => void upgrade(plan.key, "month")}
                  className={cn(
                    "mt-4 h-10 w-full text-[13px]",
                    plan.highlight
                      ? "bg-[#635bff] hover:bg-[#5851e5]"
                      : "bg-[#0a2540] hover:bg-[#143352]"
                  )}
                >
                  {busy ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {busy ? "Redirecting…" : plan.cta}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="border-t border-[#eef1f5] px-5 py-3 text-center">
          <Button
            type="button"
            variant="ghost"
            className="h-8 text-[13px] text-[#62748e]"
            onClick={() => onOpenChange(false)}
          >
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
