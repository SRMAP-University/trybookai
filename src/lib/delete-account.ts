import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

/** Permanently delete a user and related data (books cascade in Prisma). */
export async function deleteUserAccount(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, stripeSubId: true, stripeCustomerId: true },
  });
  if (!user) {
    throw new Error("Account not found");
  }

  try {
    const stripe = getStripe();
    if (user.stripeSubId) {
      await stripe.subscriptions.cancel(user.stripeSubId).catch(() => null);
    }
  } catch {
    // Stripe unset or already cancelled — still delete the account.
  }

  await db.user.delete({ where: { id: userId } });
}
