import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
    newUser: "/dashboard",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const path = request.nextUrl.pathname;
      const isAuthPage =
        path.startsWith("/login") || path.startsWith("/register");
      const isDashboard = path.startsWith("/dashboard");
      const isApiProtected =
        path.startsWith("/api/books") ||
        path.startsWith("/api/billing") ||
        path.startsWith("/api/generate") ||
        path.startsWith("/api/audio") ||
        path.startsWith("/api/settings") ||
        path.startsWith("/api/branding") ||
        path.startsWith("/api/analytics") ||
        path.startsWith("/api/studio");

      if (isAuthPage && isLoggedIn) {
        // Keep same host (www vs apex) — absolute AUTH_URL redirects cause CORS on RSC.
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }

      if ((isDashboard || isApiProtected) && !isLoggedIn) {
        if (isApiProtected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const loginUrl = new URL("/login", request.nextUrl);
        loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
        return Response.redirect(loginUrl);
      }

      return true;
    },
  },
  session: { strategy: "jwt" },
} satisfies NextAuthConfig;
