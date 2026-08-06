import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { loadAdminOverview } from "@/lib/admin-data";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const data = await loadAdminOverview();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[adarsh/overview]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
