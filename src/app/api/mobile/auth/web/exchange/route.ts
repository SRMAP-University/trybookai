import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { signMobileToken, verifyMobileCode } from "@/lib/mobile-auth";
import { mobileUserPayload, mobileUserSelect } from "@/lib/mobile-user";
import { isPkceValue, pkceChallenge } from "@/lib/mobile-web-auth";
import { persistUserCountryFromRequest } from "@/lib/geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  code: z.string().min(20).max(2000),
  verifier: z.string().refine(isPkceValue),
});

/**
 * POST /api/mobile/auth/web/exchange — the app trades the code from the
 * website's Google sign-in, plus its PKCE verifier, for a mobile token.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid sign-in payload" },
      { status: 400 }
    );
  }

  const claim = await verifyMobileCode(parsed.data.code);
  if (!claim || claim.challenge !== pkceChallenge(parsed.data.verifier)) {
    return NextResponse.json(
      { error: "This sign-in has expired. Please try again." },
      { status: 401 }
    );
  }

  const user = await db.user.findUnique({
    where: { id: claim.sub },
    select: mobileUserSelect,
  });
  if (!user) {
    return NextResponse.json(
      { error: "This account no longer exists." },
      { status: 401 }
    );
  }

  const token = await signMobileToken({
    sub: user.id,
    email: user.email,
    name: user.name,
  });
  void persistUserCountryFromRequest(user.id, request);

  return NextResponse.json({
    token,
    user: mobileUserPayload(user),
    isNew: claim.isNew,
  });
}
