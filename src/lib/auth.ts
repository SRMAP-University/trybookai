import NextAuth from "next-auth";
import type { Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { verifyMobileToken } from "@/lib/mobile-auth";
import { persistUserCountryFromRequest } from "@/lib/geo";

const nextAuth = NextAuth({
  adapter: PrismaAdapter(db),
  ...authConfig,
  events: {
    async createUser({ user }) {
      if (user.id) {
        await persistUserCountryFromRequest(user.id);
        await db.user.update({
          where: { id: user.id },
          data: { signupVia: "pc" },
        });
      }
    },
    async signIn({ user }) {
      if (user.id) await persistUserCountryFromRequest(user.id);
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
});

export const { handlers, signIn, signOut } = nextAuth;

/**
 * Session helper that accepts cookie sessions OR mobile Bearer JWTs.
 */
export async function auth(): Promise<Session | null> {
  try {
    const h = await headers();
    const authHeader = h.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const payload = await verifyMobileToken(authHeader.slice(7));
      if (payload?.sub) {
        return {
          user: {
            id: payload.sub,
            email: payload.email,
            name: payload.name ?? undefined,
            image: undefined,
          },
          expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        };
      }
    }
  } catch {
    // headers() unavailable outside request scope — fall through
  }

  return nextAuth.auth() as Promise<Session | null>;
}
