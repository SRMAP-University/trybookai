import { auth } from "@/lib/auth";

const DEFAULT_ADMINS = [
  "company@sylicaai.com",
  "blueadarsh1@gmail.com",
  "adarsh@sylicaai.com",
];

export function getAdminEmails(): string[] {
  const fromEnv = process.env.ADMIN_EMAILS?.split(/[,\s]+/).filter(Boolean) ?? [];
  return [...new Set([...fromEnv, ...DEFAULT_ADMINS].map((e) => e.toLowerCase()))];
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || !isAdminEmail(session.user.email)) {
    return null;
  }
  return session;
}
