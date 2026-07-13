import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

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
    "/api/settings",
    "/api/settings/:path*",
    "/api/branding",
    "/api/branding/:path*",
    "/api/analytics",
    "/api/analytics/:path*",
    "/api/studio",
    "/api/studio/:path*",
  ],
};
