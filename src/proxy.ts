import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { verifyMobileToken } from "@/lib/mobile-auth";
import { countryCodeFromRequest } from "@/lib/geo";
import { newAccountFinishUrl } from "@/lib/mobile-web-auth";

const { auth } = NextAuth(authConfig);

function isApiProtected(path: string) {
  return (
    path.startsWith("/api/books") ||
    path.startsWith("/api/billing") ||
    path.startsWith("/api/generate") ||
    path.startsWith("/api/audio") ||
    path.startsWith("/api/reels") ||
    path.startsWith("/api/settings") ||
    path.startsWith("/api/branding") ||
    path.startsWith("/api/analytics") ||
    path.startsWith("/api/studio") ||
    path.startsWith("/api/jobs")
  );
}

function withCountryHeader(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  if (!requestHeaders.get("x-bookai-country")) {
    const code = countryCodeFromRequest(req);
    if (code) requestHeaders.set("x-bookai-country", code);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const bearer = req.headers.get("authorization");

  // A new account made while signing in to the phone app goes back to the
  // app, not to the dashboard NextAuth sends new accounts to.
  if (path === "/dashboard") {
    const finish = newAccountFinishUrl(
      req.nextUrl.searchParams.get("callbackUrl"),
      req.nextUrl
    );
    if (finish) return NextResponse.redirect(finish);
  }

  if (bearer?.startsWith("Bearer ") && isApiProtected(path)) {
    const payload = await verifyMobileToken(bearer.slice(7));
    if (payload?.sub) {
      return withCountryHeader(req);
    }
  }

  // NextAuth edge helper accepts NextRequest at runtime; overloads are strict.
  return (auth as unknown as (request: NextRequest) => Promise<Response>)(req);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/editor/:path*",
    "/login",
    "/register",
    "/api/books",
    "/api/books/:path*",
    "/api/billing",
    "/api/billing/:path*",
    "/api/generate",
    "/api/generate/:path*",
    "/api/audio",
    "/api/audio/:path*",
    "/api/reels",
    "/api/reels/:path*",
    "/api/settings",
    "/api/settings/:path*",
    "/api/branding",
    "/api/branding/:path*",
    "/api/analytics",
    "/api/analytics/:path*",
    "/api/studio",
    "/api/studio/:path*",
    "/api/jobs",
    "/api/jobs/:path*",
  ],
};
