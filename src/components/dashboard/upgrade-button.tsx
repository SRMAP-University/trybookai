"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardUser } from "@/components/dashboard/user-context";
import { toast } from "sonner";
import { readJson } from "@/lib/api";
import { cn } from "@/lib/utils";

type PaidPlan = "PRO" | "ENTERPRISE";
type BillingInterval = "month" | "year";

export function useUpgradePlan() {
  const router = useRouter();
  const { refresh } = useDashboardUser();
  const [loading, setLoading] = useState<PaidPlan | null>(null);

  async function upgrade(
    plan: PaidPlan = "PRO",
    interval: BillingInterval = "month"
  ) {
    setLoading(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval }),
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
  plan = "PRO",
  children,
  className,
  variant = "default",
  size = "default",
}: UpgradeButtonProps) {
  const { upgrade, loading } = useUpgradePlan();

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(className)}
      disabled={!!loading}
      onClick={() => upgrade(plan)}
    >
      {loading === plan && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
      {children}
    </Button>
  );
}

type UpgradeLinkProps = {
  plan?: PaidPlan;
  children: React.ReactNode;
  className?: string;
};

export function UpgradeLink({
  plan = "PRO",
  children,
  className,
}: UpgradeLinkProps) {
  const { upgrade, loading } = useUpgradePlan();

  return (
    <button
      type="button"
      disabled={!!loading}
      onClick={() => upgrade(plan)}
      className={cn(
        "inline-flex items-center gap-1 disabled:opacity-60",
        className
      )}
    >
      {loading === plan && <Loader2 className="h-3 w-3 animate-spin" />}
      {children}
    </button>
  );
}
