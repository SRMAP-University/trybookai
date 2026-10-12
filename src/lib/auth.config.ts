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

      // Public cover images back og:image and Book schema; crawlers have no session.
      const isPublicCover = path.startsWith("/api/books/cover/");
      // Background-music cues are public R2 files; listeners on public book pages have no session.
      const isPublicMusic = path === "/api/audio/music";

      const isApiProtected =
        (path.startsWith("/api/books") && !isPublicCover) ||
        path.startsWith("/api/billing") ||
        path.startsWith("/api/generate") ||
        (path.startsWith("/api/audio") && !isPublicMusic) ||
        path.startsWith("/api/settings") ||
        path.startsWith("/api/branding") ||
        path.startsWith("/api/analytics") ||
        path.startsWith("/api/studio") ||
        path.startsWith("/api/account");

      if (isAuthPage && isLoggedIn) {
        // Keep same host (www vs apex) — absolute AUTH_URL redirects cause CORS on RSC.
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }

      if (isApiProtected && !isLoggedIn) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      return true;
    },
  },
  session: { strategy: "jwt" },
} satisfies NextAuthConfig;
