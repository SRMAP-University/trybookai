import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pricingForRequest } from "@/lib/billing";

export const dynamic = "force-dynamic";

/** Subscription prices for the caller's country (₹ in India, $ elsewhere). */
export async function GET(request: Request) {
  const session = await auth();
  const pricing = await pricingForRequest(request, session?.user?.id);
  return NextResponse.json(pricing, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
