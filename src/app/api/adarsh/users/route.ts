import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { loadAdminUsers } from "@/lib/admin-data";
import { grantUserPlan } from "@/lib/billing";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const q = new URL(request.url).searchParams.get("q") ?? undefined;
  try {
    const users = await loadAdminUsers(q || undefined);
    return NextResponse.json({ users });
  } catch (error) {
    console.error("[adarsh/users GET]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

const patchSchema = z.object({
  userId: z.string().min(1),
  plan: z.enum(["FREE", "PRO", "ENTERPRISE", "UNLIMITED"]).optional(),
  pagesLimit: z.number().int().min(0).max(1_000_000).optional(),
  audioMinutesLimit: z.number().int().min(0).max(1_000_000).optional(),
  pagesBonus: z.number().int().min(0).max(1_000_000).optional(),
});

export async function PATCH(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { userId, plan, pagesLimit, audioMinutesLimit, pagesBonus } =
    parsed.data;

  if (plan) {
    const user = await grantUserPlan(userId, plan, {
      pagesLimit,
      audioMinutesLimit,
      pagesBonus,
    });
    return NextResponse.json({ user });
  }

  const data: {
    pagesLimit?: number;
    audioMinutesLimit?: number;
    pagesBonus?: number;
  } = {};

  if (pagesLimit != null) data.pagesLimit = pagesLimit;
  if (audioMinutesLimit != null) data.audioMinutesLimit = audioMinutesLimit;
  if (pagesBonus != null) data.pagesBonus = pagesBonus;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const user = await db.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      email: true,
      plan: true,
      pagesLimit: true,
      audioMinutesLimit: true,
      pagesBonus: true,
    },
  });

  return NextResponse.json({ user });
}
