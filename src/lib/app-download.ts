import { getAppUrl } from "@/lib/book-public";

/** Stable public APK URL on R2 (overwritten on each upload). */
export function getAndroidApkUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_ANDROID_APK_URL?.trim();
  if (fromEnv) return fromEnv;

  const r2 =
    process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (r2) return `${r2}/apps/bookai-android.apk`;

  return `${getAppUrl()}/download/android`;
}

export function getAndroidDownloadPageUrl(): string {
  return `${getAppUrl()}/download`;
}

export const ANDROID_APP_VERSION =
  process.env.NEXT_PUBLIC_ANDROID_APP_VERSION?.trim() || "1.0.1";
