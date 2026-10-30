import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { signMobileCode } from "@/lib/mobile-auth";
import { sendWelcomeEmail } from "@/lib/emails/transactional";
import {
  CALLBACK_COOKIE,
  appReturnUrl,
  expiredCookie,
  isAppScheme,
  isPkceValue,
  isStateValue,
} from "@/lib/mobile-web-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** An account counts as new from the phone only if it is this fresh. */
const NEW_ACCOUNT_MS = 10 * 60 * 1000;

/**
 * GET /api/mobile/auth/web/finish — where the website's Google sign-in lands
 * when the app started it: sends the browser back to the app with a code.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const app = params.get("app");
  const challenge = params.get("challenge");
  const state = params.get("state");
  if (!isAppScheme(app) || !isStateValue(state)) {
    return NextResponse.json(
      { error: "Invalid sign-in request" },
      { status: 400 }
    );
  }

  const back = (reply: Record<string, string>) => {
    const res = NextResponse.redirect(appReturnUrl(app, { ...reply, state }));
    // The phone's sign-in is over; later website sign-ins start afresh.
    for (const { name } of request.cookies.getAll()) {
      if (CALLBACK_COOKIE.test(name)) res.cookies.set(expiredCookie(name));
    }
    return res;
  };

  if (!isPkceValue(challenge)) return back({ error: "invalid_request" });

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return back({ error: "not_signed_in" });

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  if (!user) return back({ error: "not_signed_in" });

  // NextAuth created this account just now (it went by /dashboard first):
  // it signed up on the phone, and gets the welcome the app always sent.
  const isNew =
    params.get("new") === "1" &&
    Date.now() - user.createdAt.getTime() < NEW_ACCOUNT_MS;
  if (isNew) {
    await db.user.update({
      where: { id: user.id },
      data: { signupVia: "phone" },
    });
    sendWelcomeEmail({ to: user.email, name: user.name }).catch((error) => {
      console.error("[mobile/auth/web/finish] welcome email", error);
    });
  }

  const code = await signMobileCode({ sub: user.id, challenge, isNew });
  return back({ code });
}
