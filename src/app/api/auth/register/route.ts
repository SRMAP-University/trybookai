import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { legalConsentField } from "@/lib/legal";
import { sendWelcomeEmail } from "@/lib/emails/transactional";
import { countryCodeFromRequest } from "@/lib/geo";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  acceptedTerms: legalConsentField,
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const message =
      flat.fieldErrors.acceptedTerms?.[0] ??
      flat.formErrors[0] ??
      "Invalid registration data";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const existing = await db.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (existing) {
    return NextResponse.json(
      { error: "Email already registered" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      countryCode: countryCodeFromRequest(request),
    },
  });

  sendWelcomeEmail({ to: user.email, name: user.name }).catch((error) => {
    console.error("[register] welcome email", error);
  });

  return NextResponse.json(
    { id: user.id, email: user.email, name: user.name },
    { status: 201 }
  );
}
