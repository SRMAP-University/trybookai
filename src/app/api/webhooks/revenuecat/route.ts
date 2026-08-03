import { NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import {
  applyPlanFromRevenueCat,
  resolveUserIdFromRevenueCat,
} from "@/lib/revenuecat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RevenueCatEvent = {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
};

type RevenueCatWebhookBody = {
  api_version?: string;
  event?: RevenueCatEvent;
};

const GRANT_TYPES = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);

const REVOKE_TYPES = new Set([
  "EXPIRATION",
  "CANCELLATION",
  "SUBSCRIPTION_PAUSED",
]);

/**
 * RevenueCat → BookAI plan sync.
 * Set Authorization header in the RC dashboard to match REVENUECAT_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const secret = cleanEnv(process.env.REVENUECAT_WEBHOOK_SECRET);
  if (secret) {
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;
    if (token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: RevenueCatWebhookBody;
  try {
    body = (await request.json()) as RevenueCatWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = body.event;
  if (!event?.type) {
    return NextResponse.json({ error: "Missing event" }, { status: 400 });
  }

  const ids = [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
  ].filter((id): id is string => Boolean(id));

  const userId = await resolveUserIdFromRevenueCat(ids);
  if (!userId) {
    console.warn(
      "[webhooks/revenuecat] no user for",
      event.type,
      event.app_user_id
    );
    return NextResponse.json({ ok: true, matched: false });
  }

  try {
    if (GRANT_TYPES.has(event.type)) {
      await applyPlanFromRevenueCat(userId, event.entitlement_ids ?? [], {
        allowDowngrade: false,
      });
    } else if (REVOKE_TYPES.has(event.type) || event.type === "EXPIRATION") {
      const stillActive =
        event.expiration_at_ms != null &&
        event.expiration_at_ms > Date.now() &&
        (event.entitlement_ids?.length ?? 0) > 0;

      if (stillActive) {
        await applyPlanFromRevenueCat(userId, event.entitlement_ids ?? [], {
          allowDowngrade: false,
        });
      } else if (event.type === "EXPIRATION") {
        await applyPlanFromRevenueCat(userId, [], { allowDowngrade: true });
      }
      // CANCELLATION alone often means cancel-at-period-end — keep access until EXPIRATION.
    }

    return NextResponse.json({ ok: true, matched: true, userId });
  } catch (error) {
    console.error("[webhooks/revenuecat]", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
