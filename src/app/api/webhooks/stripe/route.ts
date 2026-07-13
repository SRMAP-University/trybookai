import { NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { cleanEnv } from "@/lib/env";
import { db } from "@/lib/db";
import {
  applyCapacityPurchase,
  downgradeToFree,
  resolveUserIdFromSubscription,
  syncUserFromSubscription,
} from "@/lib/stripe-sync";

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const raw = (
    invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
    }
  ).subscription;
  if (!raw) return null;
  return typeof raw === "string" ? raw : raw.id;
}
export async function POST(request: Request) {
  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const webhookSecret = cleanEnv(process.env.STRIPE_WEBHOOK_SECRET);
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );
  } catch (error) {
    console.error("[stripe webhook] signature", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (
          session.mode === "payment" &&
          session.metadata?.bookai_capacity === "1"
        ) {
          const userId = session.metadata.userId;
          if (userId) {
            await applyCapacityPurchase(
              userId,
              Number(session.metadata.pagesQty || 0),
              Number(session.metadata.audioQty || 0)
            );
          }
          break;
        }

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        if (!subscriptionId) break;

        const subscription = await getStripe().subscriptions.retrieve(
          subscriptionId
        );
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;

        const userId =
          session.metadata?.userId ||
          (await resolveUserIdFromSubscription(subscription, customerId));
        if (!userId) {
          console.error(
            "[stripe webhook] checkout.session.completed: no userId",
            session.id
          );
          break;
        }

        if (!subscription.metadata?.userId) {
          await getStripe().subscriptions.update(subscriptionId, {
            metadata: { ...subscription.metadata, userId },
          });
        }

        await syncUserFromSubscription(userId, subscription, customerId);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;

        const userId = await resolveUserIdFromSubscription(
          subscription,
          customerId
        );
        if (!userId) {
          console.error(
            "[stripe webhook] subscription event: no userId",
            subscription.id
          );
          break;
        }

        if (!subscription.metadata?.userId) {
          await getStripe().subscriptions.update(subscription.id, {
            metadata: { ...subscription.metadata, userId },
          });
        }

        await syncUserFromSubscription(userId, subscription, customerId);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;

        const userId = await resolveUserIdFromSubscription(
          subscription,
          customerId
        );
        if (!userId) break;

        await downgradeToFree(userId);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;

        const billingReason = invoice.billing_reason;
        if (customerId && billingReason === "subscription_cycle") {
          await db.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: { pagesUsed: 0, audioMinutesUsed: 0 },
          });
        }

        // After a successful first charge (e.g. trial → paid), re-sync plan
        const subId = invoiceSubscriptionId(invoice);
        if (subId) {
          const subscription = await getStripe().subscriptions.retrieve(subId);
          const userId = await resolveUserIdFromSubscription(
            subscription,
            customerId
          );
          if (userId) {
            await syncUserFromSubscription(userId, subscription, customerId);
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;
        const subId = invoiceSubscriptionId(invoice);

        if (!subId) break;

        const subscription = await getStripe().subscriptions.retrieve(subId);
        const userId = await resolveUserIdFromSubscription(
          subscription,
          customerId
        );
        if (!userId) break;

        // Failed charge after trial/renewal → revoke paid access
        await syncUserFromSubscription(userId, subscription, customerId);
        break;
      }
    }
  } catch (error) {
    console.error("[stripe webhook] handler", event.type, error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
