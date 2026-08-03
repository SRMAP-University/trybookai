import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyMobileToken } from "@/lib/mobile-auth";

const bodySchema = z.object({
  token: z.string().min(20).max(4096),
  platform: z.enum(["ios", "android"]),
});

async function requireMobileUserId(): Promise<string | null> {
  const h = await headers();
  const authHeader = h.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const payload = await verifyMobileToken(authHeader.slice(7));
  return payload?.sub ?? null;
}

/** POST /api/mobile/devices — register or refresh an FCM token */
export async function POST(request: Request) {
  const userId = await requireMobileUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid token payload" }, { status: 400 });
  }

  const { token, platform } = parsed.data;

  await db.devicePushToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform, updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

/** DELETE /api/mobile/devices — unregister current device token */
export async function DELETE(request: Request) {
  const userId = await requireMobileUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let token: string | undefined;
  try {
    const json = (await request.json()) as { token?: string };
    token = json.token;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  await db.devicePushToken.deleteMany({
    where: { userId, token },
  });

  return NextResponse.json({ ok: true });
}
