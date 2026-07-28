"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useDashboardUser } from "@/components/dashboard/user-context";
import { toast } from "sonner";
import { readJson } from "@/lib/api";
import { cn } from "@/lib/utils";

type PaidPlan = "PRO" | "ENTERPRISE";
type BillingInterval = "month" | "year";

type UpgradeOptions = {
  acceptedTerms?: boolean;
};

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
