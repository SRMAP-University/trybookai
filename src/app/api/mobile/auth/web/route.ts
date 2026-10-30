import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { signIn } from "@/lib/auth";
import {
  MOBILE_FINISH_PATH,
  SESSION_COOKIE,
  expiredCookie,
  isAppScheme,
  isPkceValue,
  isStateValue,
} from "@/lib/mobile-web-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/auth/web?app=&challenge=&state= — the app opens this in the
 * browser to sign in with Google on the website (see lib/mobile-web-auth).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const app = params.get("app");
  const challenge = params.get("challenge");
  const state = params.get("state");
  if (!isAppScheme(app) || !isPkceValue(challenge) || !isStateValue(state)) {
    return NextResponse.json(
      { error: "Invalid sign-in request" },
      { status: 400 }
    );
  }

  const finish = `${MOBILE_FINISH_PATH}?${new URLSearchParams({
    app,
    challenge,
    state,
  })}`;

  // Start signed out of the website in this browser. Signed in as someone
  // else, NextAuth would refuse the Google account picked (if it belongs to
  // another BookAI account) or attach it to that someone instead.
  const jar = await cookies();
  for (const { name } of jar.getAll()) {
    if (SESSION_COOKIE.test(name)) jar.set(expiredCookie(name));
  }

  // Always through Google's account chooser, so the app signs in as the
  // account the person picks.
  await signIn("google", { redirectTo: finish }, { prompt: "select_account" });
  return NextResponse.json(
    { error: "Could not start Google sign-in" },
    { status: 500 }
  );
}
