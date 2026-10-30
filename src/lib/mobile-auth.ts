import { SignJWT, jwtVerify } from "jose";
import { cleanEnv } from "@/lib/env";

const MOBILE_AUD = "bookai-mobile";
const TOKEN_TTL = "30d";

function secretKey() {
  const secret =
    cleanEnv(process.env.AUTH_SECRET) ||
    cleanEnv(process.env.NEXTAUTH_SECRET);
  if (!secret) {
    throw new Error("AUTH_SECRET / NEXTAUTH_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export type MobileTokenPayload = {
  sub: string;
  email: string;
  name?: string | null;
};

export async function signMobileToken(user: MobileTokenPayload) {
  return new SignJWT({
    email: user.email,
    name: user.name ?? null,
    typ: "mobile",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.sub)
    .setAudience(MOBILE_AUD)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey());
}

const CODE_AUD = "bookai-mobile-code";

/**
 * The code the website hands back to the app after a Google sign-in. It lasts
 * three minutes and is tied to the app's PKCE challenge, so only the app that
 * started the sign-in can redeem it. Its audience keeps it from working as a
 * session token.
 */
export async function signMobileCode(input: {
  sub: string;
  challenge: string;
  isNew: boolean;
}) {
  return new SignJWT({ chal: input.challenge, new: input.isNew, typ: "code" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.sub)
    .setAudience(CODE_AUD)
    .setIssuedAt()
    .setExpirationTime("3m")
    .sign(secretKey());
}

export async function verifyMobileCode(code: string) {
  try {
    const { payload } = await jwtVerify(code, secretKey(), {
      audience: CODE_AUD,
    });
    if (!payload.sub || typeof payload.chal !== "string") return null;
    return {
      sub: payload.sub,
      challenge: payload.chal,
      isNew: payload.new === true,
    };
  } catch {
    return null;
  }
}

export async function verifyMobileToken(
  token: string
): Promise<MobileTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      audience: MOBILE_AUD,
    });
    if (!payload.sub || typeof payload.email !== "string") return null;
    return {
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : null,
    };
  } catch {
    return null;
  }
}
