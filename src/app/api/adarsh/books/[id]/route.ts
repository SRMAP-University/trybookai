import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { loadBookTroubleshoot } from "@/lib/admin-data";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const data = await loadBookTroubleshoot(id);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("[adarsh/books/:id]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
