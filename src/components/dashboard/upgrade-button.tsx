"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useDashboardUser } from "@/components/dashboard/user-context";
import { toast } from "sonner";
import { readJson } from "@/lib/api";
import {
  REGIONAL_PRICING,
  type RegionalPricing,
} from "@/lib/regional-pricing";
import { cn } from "@/lib/utils";

type PaidPlan = "PRO" | "ENTERPRISE" | "UNLIMITED";
type BillingInterval = "month" | "year";

type UpgradeOptions = {
  acceptedTerms?: boolean;
};

let pricingCache: RegionalPricing | null = null;

/** Prices for the visitor's country; null until loaded. Fetched once per page load. */
export function useRegionalPricing(enabled = true) {
  const [pricing, setPricing] = useState<RegionalPricing | null>(pricingCache);

  useEffect(() => {
    if (!enabled || pricingCache) return;
    let cancelled = false;
    fetch("/api/billing/pricing")
      .then((res) => readJson<RegionalPricing>(res))
      .then((result) => {
        // Checkout's own page shows the real amount, so USD is a safe fallback.
        const next = result.ok ? result.data : REGIONAL_PRICING.DEFAULT;
        if (result.ok) pricingCache = next;
        if (!cancelled) setPricing(next);
      })
      .catch(() => {
        if (!cancelled) setPricing(REGIONAL_PRICING.DEFAULT);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return pricing;
}

export function useUpgradePlan() {
  const router = useRouter();
  const { refresh } = useDashboardUser();
  const [loading, setLoading] = useState<PaidPlan | null>(null);

  async function upgrade(
    plan: PaidPlan = "PRO",
    interval: BillingInterval = "month",
    _options?: UpgradeOptions
  ) {
    setLoading(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          interval,
          acceptedTerms: true,
        }),
      });
      const result = await readJson<{
        error?: string;
        url?: string;
        upgraded?: boolean;
        plan?: string;
        instant?: boolean;
      }>(res);

      if (!result.ok) {
        throw new Error(result.error);
      }

      const data = result.data;

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      if (data.upgraded) {
        toast.success(
          data.instant
            ? `Upgraded to ${data.plan} instantly`
            : `Upgraded to ${data.plan}`
        );
        refresh();
        router.refresh();
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not upgrade plan"
      );
    } finally {
      setLoading(null);
    }
  }

  return { upgrade, loading };
}

type UpgradeButtonProps = {
  plan?: PaidPlan;
  children: React.ReactNode;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
};

export function UpgradeButton({
  children,
  className,
  variant = "default",
  size = "default",
}: UpgradeButtonProps) {
  return (
    <Button variant={variant} size={size} className={cn(className)} asChild>
      <Link href="/dashboard/billing">{children}</Link>
    </Button>
  );
}

type UpgradeLinkProps = {
  plan?: PaidPlan;
  children: React.ReactNode;
  className?: string;
};

export function UpgradeLink({ children, className }: UpgradeLinkProps) {
  return (
    <Link
      href="/dashboard/billing"
      className={cn("inline-flex items-center gap-1", className)}
    >
      {children}
    </Link>
  );
}
