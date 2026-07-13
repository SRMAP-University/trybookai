"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Check, Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readJson } from "@/lib/api";
import { ADDONS } from "@/lib/addons";
import { PLANS, PREMIUM_TRIAL, type BillingInterval } from "@/lib/constants";
import {
  PRICING_FEATURES,
  PRICING_PLANS,
  pricingHeaderStyle,
} from "@/lib/pricing-plans";
import { useUpgradePlan } from "@/components/dashboard/upgrade-button";
import { useDashboardUser } from "@/components/dashboard/user-context";
import {
  TrialBanner,
  isClientTrialActive,
} from "@/components/dashboard/trial-banner";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function AddonStepper({
  label,
  description,
  unitPrice,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  unitPrice: number;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#eef1f5] bg-[#fafbfc] px-4 py-4">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-[#0a2540]">{label}</p>
        <p className="mt-0.5 text-[13px] text-[#697386]">{description}</p>
        <p className="mt-1 text-[13px] font-medium text-[#0a2540]">
          ${unitPrice} each
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e6ebf1] bg-white text-[#0a2540] disabled:opacity-40"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-8 text-center text-[16px] font-semibold tabular-nums text-[#0a2540]">
          {value}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={disabled || value >= 50}
          onClick={() => onChange(Math.min(50, value + 1))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e6ebf1] bg-white text-[#0a2540] disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function BillingContent({
  instantUpgrade = true,
}: {
  instantUpgrade?: boolean;
}) {
  const searchParams = useSearchParams();
  const { upgrade, loading } = useUpgradePlan();
  const { user, refresh } = useDashboardUser();
  const [trialLoading, setTrialLoading] = useState<"start" | "end" | null>(
    null
  );
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [pagesQty, setPagesQty] = useState(0);
  const [audioQty, setAudioQty] = useState(0);
  const [pagesBonus, setPagesBonus] = useState(0);
  const [audioBonus, setAudioBonus] = useState(0);
  const [addonsLoading, setAddonsLoading] = useState(false);
  const [addonsSaving, setAddonsSaving] = useState(false);

  const onTrial = isClientTrialActive(user?.trialEndsAt, user?.onTrial);
  const canStartTrial = !user?.hasStripeSubscription && !onTrial;
  const currentPlan = user?.plan;
  const canManageAddons =
    (currentPlan === "PRO" || currentPlan === "ENTERPRISE") && !onTrial;
  const addonTotal =
    pagesQty * ADDONS.PAGES.unitPrice + audioQty * ADDONS.AUDIO.unitPrice;
  const projectedPages =
    (currentPlan === "PRO" || currentPlan === "ENTERPRISE"
      ? PLANS[currentPlan].pagesLimit
      : 0) +
    pagesBonus +
    pagesQty * ADDONS.PAGES.pagesPerUnit;
  const projectedAudio =
    (currentPlan === "PRO" || currentPlan === "ENTERPRISE"
      ? PLANS[currentPlan].audioMinutesLimit
      : 0) +
    audioBonus +
    audioQty * ADDONS.AUDIO.audioMinutesPerUnit;

  useEffect(() => {
    let cancelled = false;

    async function syncFromStripe() {
      const success = searchParams.get("success");
      const capacity = searchParams.get("capacity");
      const needsHeal =
        user?.plan === "FREE" ||
        (user?.pagesLimit ?? 50) <= 50 ||
        (user?.audioMinutesLimit ?? 0) <= 0;

      if (!success && !capacity && !needsHeal) return;

      try {
        const res = await fetch("/api/billing/sync", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && (data as { synced?: boolean }).synced) {
          refresh();
          if (success) {
            toast.success(
              searchParams.get("trial")
                ? "Premium trial started — limits unlocked."
                : "Subscription synced — Premium limits are active."
            );
          }
        } else if (success) {
          toast.success(
            searchParams.get("trial")
              ? "Premium trial started in Stripe — enjoy 2 days free."
              : "Subscription activated! Refreshing your plan…"
          );
          refresh();
        }
      } catch {
        if (success && !cancelled) {
          toast.success("Subscription activated! Refreshing your plan…");
          refresh();
        }
      }

      if (capacity && !cancelled) {
        toast.success("Capacity purchased — credits added to your account.");
        refresh();
      }
      if (searchParams.get("canceled") && !cancelled) {
        toast.info("Checkout canceled.");
      }
    }

    void syncFromStripe();
    return () => {
      cancelled = true;
    };
    // Sync once when billing loads / after checkout return
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!canManageAddons) return;
    let cancelled = false;
    setAddonsLoading(true);
    fetch("/api/billing/addons")
      .then(async (res) => {
        const result = await readJson<{
          pagesBonus?: number;
          audioMinutesBonus?: number;
          error?: string;
        }>(res);
        if (!result.ok || cancelled) return;
        setPagesBonus(result.data.pagesBonus ?? 0);
        setAudioBonus(result.data.audioMinutesBonus ?? 0);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setAddonsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canManageAddons, currentPlan, user?.hasStripeSubscription]);

  async function handleCheckout(plan: "PRO" | "ENTERPRISE") {
    await upgrade(plan, interval);
  }

  async function handleTrial(action: "start" | "end") {
    setTrialLoading(action);
    try {
      const res = await fetch("/api/billing/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, interval }),
      });
      const result = await readJson<{
        error?: string;
        message?: string;
        url?: string;
      }>(res);
      if (!result.ok) {
        throw new Error(result.error);
      }
      if (result.data.url) {
        toast.message(result.data.message ?? "Continue in Stripe…");
        window.location.href = result.data.url;
        return;
      }
      toast.success(result.data.message ?? "Trial updated");
      refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update trial"
      );
    } finally {
      setTrialLoading(null);
    }
  }

  async function handleBuyCapacity() {
    if (pagesQty <= 0 && audioQty <= 0) {
      toast.error("Select at least one pack to buy.");
      return;
    }
    setAddonsSaving(true);
    try {
      const res = await fetch("/api/billing/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagesQty, audioQty }),
      });
      const result = await readJson<{
        error?: string;
        message?: string;
        url?: string;
        pagesBonus?: number;
        audioMinutesBonus?: number;
      }>(res);
      if (!result.ok) {
        throw new Error(result.error);
      }
      if (result.data.url) {
        toast.message(result.data.message ?? "Continue to Stripe…");
        window.location.href = result.data.url;
        return;
      }
      setPagesBonus(result.data.pagesBonus ?? pagesBonus);
      setAudioBonus(result.data.audioMinutesBonus ?? audioBonus);
      setPagesQty(0);
      setAudioQty(0);
      toast.success(result.data.message ?? "Capacity added");
      refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not buy capacity"
      );
    } finally {
      setAddonsSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            Billing
          </h1>
          <p className="mt-1 text-[14px] text-[#697386]">
            Manage your subscription, page credits, and audiobook minutes.
          </p>
          {instantUpgrade && (
            <p className="mt-2 text-sm text-[#635bff]">
              Stripe is not configured yet — upgrades apply instantly with one
              click.
            </p>
          )}
          {!instantUpgrade && (
              <button
                type="button"
                className="mt-2 text-[13px] font-medium text-[#635bff] hover:underline"
                onClick={async () => {
                  const res = await fetch("/api/billing/sync", {
                    method: "POST",
                  });
                  const data = await res.json().catch(() => ({}));
                  if (res.ok && (data as { synced?: boolean }).synced) {
                    const plan = (data as { plan?: string }).plan;
                    toast.success(
                      plan === "FREE"
                        ? "Synced with Stripe — you're on Free (payment not active)."
                        : "Plan synced from Stripe."
                    );
                    refresh();
                  } else {
                    toast.message(
                      (data as { reason?: string }).reason === "no_subscription"
                        ? "No active Stripe subscription found — switching to Free if needed."
                        : "Could not sync from Stripe."
                    );
                    // If Stripe has nothing, force a local refresh path
                    refresh();
                  }
                }}
              >
                Refresh plan from Stripe
              </button>
            )}
        </div>

        <div className="inline-flex rounded-full border border-[#e8e8e8] bg-[#f7f7f7] p-1">
          <button
            type="button"
            onClick={() => setInterval("month")}
            className={cn(
              "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
              interval === "month"
                ? "bg-white text-[#0a2540] shadow-sm"
                : "text-[#697386] hover:text-[#0a2540]"
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("year")}
            className={cn(
              "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
              interval === "year"
                ? "bg-white text-[#0a2540] shadow-sm"
                : "text-[#697386] hover:text-[#0a2540]"
            )}
          >
            Yearly
            <span className="ml-1.5 text-[11px] font-semibold text-[#0e6245]">
              2 mo free
            </span>
          </button>
        </div>
      </div>

      {onTrial && user && (
        <TrialBanner
          trialEndsAt={user.trialEndsAt}
          pagesUsed={user.pagesUsed}
          pagesLimit={user.pagesLimit}
          audioMinutesUsed={user.audioMinutesUsed ?? 0}
          audioMinutesLimit={user.audioMinutesLimit ?? 0}
          onEndTrial={() => handleTrial("end")}
          ending={trialLoading === "end"}
        />
      )}

      <div className="grid items-stretch gap-5 pt-3 lg:grid-cols-3">
        {PRICING_PLANS.map((planMeta) => {
          const key = planMeta.key;
          const plan = PLANS[key];
          const items = PRICING_FEATURES[key];
          const displayPrice =
            key === "FREE"
              ? 0
              : interval === "year"
                ? plan.yearlyPrice
                : plan.price;
          const periodLabel =
            key === "FREE"
              ? "forever"
              : interval === "year"
                ? "per year"
                : "per month";
          const isCurrent =
            currentPlan === key ||
            (key === "ENTERPRISE" && onTrial && currentPlan === "ENTERPRISE");

          return (
            <div
              key={key}
              className={cn(
                "relative flex flex-col overflow-visible rounded-2xl border border-[#e8e8e8] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)]",
                planMeta.highlight &&
                  "border-[#c9c5ff] shadow-[0_12px_40px_rgba(99,91,255,0.12)]",
                isCurrent && "ring-2 ring-[#635bff]/30"
              )}
            >
              {key === "ENTERPRISE" && (
                <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
                  <span className="inline-flex whitespace-nowrap rounded-full bg-[#0a2540] px-3.5 py-1.5 text-[12px] font-medium text-white shadow-md">
                    {onTrial
                      ? "Free trial active"
                      : `${PREMIUM_TRIAL.days}-day free trial`}
                  </span>
                </div>
              )}

              <div
                className="overflow-hidden rounded-t-2xl px-7 pb-2 pt-10"
                style={pricingHeaderStyle(planMeta.headerFrom)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0a2540]">
                    {plan.name}
                  </h3>
                  {isCurrent && (
                    <span className="rounded-full bg-[#f0efff] px-2 py-0.5 text-[11px] font-semibold text-[#635bff]">
                      Current
                    </span>
                  )}
                </div>

                <p className="mt-5 text-[13px] font-medium text-[#697386]">
                  Starts at
                </p>
                <div className="mt-1 flex items-end gap-2">
                  <span className="text-[48px] font-bold leading-none tracking-[-0.04em] text-[#0a2540]">
                    ${displayPrice}
                  </span>
                  <span className="mb-1.5 text-[14px] text-[#697386]">
                    {periodLabel}
                  </span>
                </div>

                {key === "ENTERPRISE" && (
                  <p className="mt-2 text-[13px] font-medium text-[#0e6245]">
                    {PREMIUM_TRIAL.days}-day free trial ·{" "}
                    {PREMIUM_TRIAL.pagesLimit.toLocaleString()} pages ·{" "}
                    {Math.round(PREMIUM_TRIAL.audioMinutesLimit / 60)} hours
                    audio
                  </p>
                )}
                {key === "PRO" && interval === "year" && (
                  <p className="mt-2 text-[13px] font-medium text-[#0e6245]">
                    2 months free vs monthly
                  </p>
                )}

                <p className="mt-4 min-h-[48px] text-[14px] leading-relaxed text-[#697386]">
                  {planMeta.description}
                </p>
              </div>

              <div className="flex flex-1 flex-col px-7 pb-7 pt-3">
                {key === "FREE" && (
                  <Button
                    variant="outline"
                    className="mt-1 h-11 w-full border-[#e6ebf1] text-[14px] font-semibold text-[#0a2540]"
                    disabled
                  >
                    {isCurrent ? "Your current plan" : "Free plan"}
                  </Button>
                )}

                {key === "PRO" && (
                  <Button
                    className="mt-1 h-11 w-full bg-[#635bff] text-[14px] font-semibold hover:bg-[#5851e5]"
                    onClick={() => handleCheckout("PRO")}
                    disabled={
                      !!loading ||
                      !!trialLoading ||
                      currentPlan === "PRO" ||
                      currentPlan === "ENTERPRISE"
                    }
                  >
                    {loading === "PRO" && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {currentPlan === "PRO"
                      ? "Your current plan"
                      : currentPlan === "ENTERPRISE"
                        ? "Included in Premium"
                        : instantUpgrade
                          ? "Upgrade to Pro"
                          : "Checkout Pro"}
                  </Button>
                )}

                {key === "ENTERPRISE" && (
                  <div className="mt-1 space-y-2">
                    {canStartTrial && (
                      <Button
                        className="h-11 w-full border-0 bg-[#0a2540] text-[14px] font-semibold text-white hover:bg-[#071a2e]"
                        onClick={() => handleTrial("start")}
                        disabled={!!loading || !!trialLoading}
                      >
                        {trialLoading === "start" && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Start free trial · $0 today
                      </Button>
                    )}
                    {onTrial && (
                      <Button
                        className="h-11 w-full bg-[#0e6245] text-[14px] font-semibold hover:bg-[#0a4d37]"
                        onClick={() => handleTrial("end")}
                        disabled={!!loading || !!trialLoading}
                      >
                        {trialLoading === "end" && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Unlock full Premium
                      </Button>
                    )}
                    {!onTrial && !canStartTrial && (
                      <Button
                        className="h-11 w-full bg-[#635bff] text-[14px] font-semibold text-white hover:bg-[#5851e5]"
                        onClick={() => handleCheckout("ENTERPRISE")}
                        disabled={
                          !!loading ||
                          !!trialLoading ||
                          (currentPlan === "ENTERPRISE" &&
                            !!user?.hasStripeSubscription)
                        }
                      >
                        {loading === "ENTERPRISE" && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {currentPlan === "ENTERPRISE" &&
                        user?.hasStripeSubscription
                          ? "Your current plan"
                          : instantUpgrade
                            ? "Upgrade to Premium"
                            : "Checkout Premium"}
                      </Button>
                    )}
                    {canStartTrial && (
                      <p className="text-center text-[12px] text-[#697386]">
                        Then ${displayPrice}/{interval === "year" ? "yr" : "mo"} ·
                        cancel anytime
                      </p>
                    )}
                  </div>
                )}

                <div className="my-6 h-px bg-[#eef1f5]" />

                <p className="text-[13px] font-medium text-[#0a2540]">
                  {planMeta.featuresLabel}
                </p>
                <ul className="mt-4 space-y-3">
                  {items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-[14px] leading-snug text-[#425466]"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0a2540]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      <section className="rounded-2xl border border-[#e8e8e8] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#0a2540]">
              Buy extra capacity
            </h2>
            <p className="mt-1 text-[14px] text-[#697386]">
              One-time payment — $2 per 1,000 pages, $15 per hour of audiobook.
              Charged immediately (not added to your subscription).
            </p>
          </div>
          {canManageAddons && addonTotal > 0 && (
            <p className="text-[13px] font-medium text-[#0a2540]">
              ${addonTotal} due now
            </p>
          )}
        </div>

        {!canManageAddons ? (
          <p className="mt-5 rounded-xl bg-[#f7f8fa] px-4 py-3 text-[14px] text-[#697386]">
            {onTrial
              ? "Finish or unlock your free trial first — then buy extra capacity."
              : "Upgrade to Pro or Premium to buy extra pages and audiobook minutes."}
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {addonsLoading ? (
              <div className="flex items-center gap-2 text-[14px] text-[#697386]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : (
              <>
                {(pagesBonus > 0 || audioBonus > 0) && (
                  <p className="rounded-xl bg-[#f0faf6] px-4 py-3 text-[13px] text-[#0e6245]">
                    Already purchased: +{pagesBonus.toLocaleString()} pages
                    {audioBonus > 0
                      ? ` · +${audioBonus} min audio`
                      : ""}
                  </p>
                )}
                <AddonStepper
                  label={ADDONS.PAGES.name}
                  description={ADDONS.PAGES.description}
                  unitPrice={ADDONS.PAGES.unitPrice}
                  value={pagesQty}
                  onChange={setPagesQty}
                  disabled={addonsSaving}
                />
                <AddonStepper
                  label={ADDONS.AUDIO.name}
                  description={ADDONS.AUDIO.description}
                  unitPrice={ADDONS.AUDIO.unitPrice}
                  value={audioQty}
                  onChange={setAudioQty}
                  disabled={addonsSaving}
                />
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <p className="text-[13px] text-[#697386]">
                    After purchase:{" "}
                    <span className="font-semibold text-[#0a2540]">
                      {projectedPages.toLocaleString()} pages
                    </span>{" "}
                    ·{" "}
                    <span className="font-semibold text-[#0a2540]">
                      {projectedAudio} min audio
                    </span>
                  </p>
                  <Button
                    className="h-10 bg-[#635bff] px-5 text-[14px] font-semibold hover:bg-[#5851e5]"
                    disabled={
                      addonsSaving || (pagesQty <= 0 && audioQty <= 0)
                    }
                    onClick={handleBuyCapacity}
                  >
                    {addonsSaving && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {addonTotal > 0
                      ? `Pay $${addonTotal} once`
                      : "Select packs"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </motion.div>
  );
}
