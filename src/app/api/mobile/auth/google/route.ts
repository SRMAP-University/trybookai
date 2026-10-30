import { NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { db } from "@/lib/db";
import { cleanEnv } from "@/lib/env";
import { signMobileToken } from "@/lib/mobile-auth";
import { mobileUserPayload, mobileUserSelect } from "@/lib/mobile-user";
import { sendWelcomeEmail } from "@/lib/emails/transactional";
import { countryCodeFromRequest, persistUserCountryFromRequest } from "@/lib/geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  idToken: z.string().min(20),
});

const googleJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

function allowedAudiences(): string[] {
  const primary = cleanEnv(process.env.GOOGLE_CLIENT_ID);
  const extras = cleanEnv(process.env.GOOGLE_MOBILE_CLIENT_IDS);
  const list = [primary, ...(extras ? extras.split(",") : [])]
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(list)];
}

/** POST /api/mobile/auth/google — exchange Google ID token for mobile JWT. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Google sign-in payload" }, { status: 400 });
  }

  const audiences = allowedAudiences();
  if (audiences.length === 0) {
    return NextResponse.json(
      { error: "Google sign-in is not configured on the server." },
      { status: 503 }
    );
  }

  let googleSub: string;
  let email: string;
  let name: string | null = null;
  let picture: string | null = null;
  let emailVerified = false;

  try {
    const { payload } = await jwtVerify(parsed.data.idToken, googleJwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: audiences,
    });

    if (typeof payload.sub !== "string" || !payload.sub) {
      throw new Error("Missing subject");
    }
    if (typeof payload.email !== "string" || !payload.email) {
      throw new Error("Missing email");
    }

    googleSub = payload.sub;
    email = payload.email.toLowerCase().trim();
    name = typeof payload.name === "string" ? payload.name : null;
    picture = typeof payload.picture === "string" ? payload.picture : null;
    emailVerified = payload.email_verified === true;
  } catch (error) {
    console.error("[mobile/auth/google] token verify", error);
    return NextResponse.json(
      { error: "Invalid or expired Google token" },
      { status: 401 }
    );
  }

  if (!emailVerified) {
    return NextResponse.json(
      { error: "Google email is not verified" },
      { status: 403 }
    );
  }

  try {
    const existingAccount = await db.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: googleSub,
        },
      },
      include: { user: { select: mobileUserSelect } },
    });

    if (existingAccount?.user) {
      const token = await signMobileToken({
        sub: existingAccount.user.id,
        email: existingAccount.user.email,
        name: existingAccount.user.name,
      });
      void persistUserCountryFromRequest(existingAccount.user.id, request);
      return NextResponse.json({
        token,
        user: mobileUserPayload(existingAccount.user),
        isNew: false,
      });
    }

    let user = await db.user.findUnique({
      where: { email },
      select: mobileUserSelect,
    });

    let isNew = false;

    if (user) {
      await db.account.create({
        data: {
          userId: user.id,
          type: "oauth",
          provider: "google",
          providerAccountId: googleSub,
          id_token: parsed.data.idToken,
        },
      });
      if ((!user.name && name) || (!user.image && picture)) {
        user = await db.user.update({
          where: { id: user.id },
          data: {
            name: user.name ?? name,
            image: user.image ?? picture,
          },
          select: mobileUserSelect,
        });
      }
    } else {
      // New Google accounts implicitly accept terms (same as web OAuth).
      isNew = true;
      user = await db.user.create({
        data: {
          email,
          name,
          image: picture,
          countryCode: countryCodeFromRequest(request),
          signupVia: "phone",
          accounts: {
            create: {
              type: "oauth",
              provider: "google",
              providerAccountId: googleSub,
              id_token: parsed.data.idToken,
            },
          },
        },
        select: mobileUserSelect,
      });

      sendWelcomeEmail({ to: user.email, name: user.name }).catch((error) => {
        console.error("[mobile/auth/google] welcome email", error);
      });
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
      isNew,
    });
  } catch (error) {
    console.error("[mobile/auth/google]", error);
    return NextResponse.json(
      { error: "Could not complete Google sign-in" },
      { status: 500 }
    );
  }
}
