import { NextResponse } from "next/server";
import { getAndroidApkUrl } from "@/lib/app-download";

/** GET /download/android — redirect to the public APK on R2. */
export async function GET() {
  return NextResponse.redirect(getAndroidApkUrl(), 302);
}
