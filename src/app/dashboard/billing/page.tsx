import { Suspense } from "react";
import { BillingContent } from "./billing-content";
import { Skeleton } from "@/components/ui/skeleton";
import { isStripeBillingEnabled } from "@/lib/billing";
import { AnonymousRouteFallback } from "@/components/dashboard/anonymous-route-fallback";

export default function BillingPage() {
  const instantUpgrade = !isStripeBillingEnabled();

  return (
    <AnonymousRouteFallback
      title="Billing"
      description="Manage your plan, usage limits, and billing details."
    >
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        }
      >
        <BillingContent instantUpgrade={instantUpgrade} />
      </Suspense>
    </AnonymousRouteFallback>
  );
}
