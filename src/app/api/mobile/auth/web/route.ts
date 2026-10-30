import { NextResponse, type NextRequest } from "next/server";
import { signIn } from "@/lib/auth";
import {
  MOBILE_FINISH_PATH,
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

  // Always through Google's account chooser, so the app signs in as the
  // account the person picks, not whoever is signed in to the website here.
  await signIn("google", { redirectTo: finish }, { prompt: "select_account" });
  return NextResponse.json(
    { error: "Could not start Google sign-in" },
    { status: 500 }
  );
}
