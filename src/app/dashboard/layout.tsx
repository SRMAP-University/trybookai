import { DashboardShell } from "@/components/dashboard/shell";

export const dynamic = "force-dynamic";
import type { DashboardUser } from "@/components/dashboard/user-context";
import { auth } from "@/lib/auth";
import { isTrialActive } from "@/lib/billing";
import { db } from "@/lib/db";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  let initialUser: DashboardUser | null = null;

  if (session?.user?.id) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true,
        plan: true,
        pagesUsed: true,
        pagesLimit: true,
        audioMinutesUsed: true,
        audioMinutesLimit: true,
        trialEndsAt: true,
        hasUsedPremiumTrial: true,
        stripeSubId: true,
      },
    });

    if (user) {
      initialUser = {
        name: user.name,
        email: user.email,
        plan: user.plan,
        pagesUsed: user.pagesUsed,
        pagesLimit: user.pagesLimit,
        audioMinutesUsed: user.audioMinutesUsed,
        audioMinutesLimit: user.audioMinutesLimit,
        trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
        hasUsedPremiumTrial: user.hasUsedPremiumTrial,
        hasStripeSubscription: Boolean(user.stripeSubId),
        onTrial: isTrialActive(user),
      };
    }
  }

  return (
    <DashboardShell initialUser={initialUser}>{children}</DashboardShell>
  );
}
