import { randomBytes } from "crypto";
import { cleanEnvUrl } from "@/lib/env";

/** SEO-friendly base from a title. */
export function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "book";
}

/** Unique public slug: `{title-slug}-{8-char-id}` */
export function createBookSlug(title: string): string {
  const suffix = randomBytes(4).toString("hex");
  return `${slugifyTitle(title)}-${suffix}`;
}

export function canMakePrivate(plan: string): boolean {
  return plan === "PRO" || plan === "ENTERPRISE";
}

export function getAppUrl(): string {
  return (
    cleanEnvUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    cleanEnvUrl(process.env.NEXTAUTH_URL) ||
    "http://localhost:3000"
  );
}
