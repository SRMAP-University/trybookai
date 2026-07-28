import { db } from "@/lib/db";
import { sendTrialStartedEmail } from "@/lib/emails/transactional";
import { getStripe } from "@/lib/stripe";

export async function notifyTrialStarted(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      emailNotifications: true,
      trialEndsAt: true,
      stripeSubId: true,
    },
  });

  if (
    !user?.emailNotifications ||
    !user.trialEndsAt ||
    user.trialEndsAt.getTime() <= Date.now()
  ) {
    return { sent: false as const, reason: "no_active_trial" };
  }

  let interval: "month" | "year" = "month";
  if (user.stripeSubId) {
    try {
      const sub = await getStripe().subscriptions.retrieve(user.stripeSubId, {
        expand: ["items.data.price"],
      });
      const price = sub.items.data[0]?.price;
      if (price?.recurring?.interval === "year") interval = "year";
    } catch {
      // default monthly
    }
  }

  const result = await sendTrialStartedEmail({
    to: user.email,
    name: user.name,
    trialEndsAt: user.trialEndsAt,
    interval,
  });

  return {
    sent: result.ok,
    skipped: !result.ok && "skipped" in result ? result.skipped : false,
  };
}
