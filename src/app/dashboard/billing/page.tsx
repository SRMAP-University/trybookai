import { Suspense } from "react";
import { BillingContent } from "./billing-content";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import { isStripeBillingEnabled, pricingForRequest } from "@/lib/billing";
import { AnonymousRouteFallback } from "@/components/dashboard/anonymous-route-fallback";

export default async function BillingPage() {
  const instantUpgrade = !isStripeBillingEnabled();
  const session = await auth();
  const pricing = await pricingForRequest(null, session?.user?.id);

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
        <BillingContent instantUpgrade={instantUpgrade} pricing={pricing} />
      </Suspense>
    </AnonymousRouteFallback>
  );
}
