import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const brandingSchema = z.object({
  brandName: z.string().max(100).nullable().optional(),
  brandTagline: z.string().max(200).nullable().optional(),
  authorName: z.string().max(100).nullable().optional(),
  imprintName: z.string().max(100).nullable().optional(),
  websiteUrl: z.string().max(300).nullable().optional(),
  brandColor: z.string().max(20).optional(),
  logoUrl: z.string().max(500).nullable().optional(),
  copyrightNotice: z.string().max(1000).nullable().optional(),
  dedicationDefault: z.string().max(2000).nullable().optional(),
  exportFooter: z.string().max(1000).nullable().optional(),
  includeBrandInExport: z.boolean().optional(),
});

const brandingSelect = {
  brandName: true,
  brandTagline: true,
  authorName: true,
  imprintName: true,
  websiteUrl: true,
  brandColor: true,
  logoUrl: true,
  copyrightNotice: true,
  dedicationDefault: true,
  exportFooter: true,
  includeBrandInExport: true,
  name: true,
  email: true,
} as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const branding = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: brandingSelect,
  });

  return NextResponse.json(branding);
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = brandingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updated = await db.user.update({
    where: { id: session.user.id },
    data: parsed.data,
    select: brandingSelect,
  });

  return NextResponse.json(updated);
}
