import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { loadAdminBooks } from "@/lib/admin-data";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const books = await loadAdminBooks();
    return NextResponse.json({ books });
  } catch (error) {
    console.error("[adarsh/books]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
