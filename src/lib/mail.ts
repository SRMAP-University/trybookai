import nodemailer from "nodemailer";
import type Transporter from "nodemailer/lib/mailer";
import { cleanEnv } from "@/lib/env";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

let transporter: Transporter | null = null;

export function isMailConfigured(): boolean {
  return Boolean(
    cleanEnv(process.env.SMTP_HOST) &&
      cleanEnv(process.env.SMTP_USER) &&
      cleanEnv(process.env.SMTP_PASS)
  );
}

function getFromAddress(): string {
  return (
    cleanEnv(process.env.SMTP_FROM) || "BookAI <welcome@trybookai.com>"
  );
}

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const host = cleanEnv(process.env.SMTP_HOST);
  const user = cleanEnv(process.env.SMTP_USER);
  const pass = cleanEnv(process.env.SMTP_PASS);

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured (SMTP_HOST, SMTP_USER, and SMTP_PASS required)."
    );
  }

  // Cloudflare Email Service SMTP uses implicit TLS on 465.
  // Generic providers (SendGrid, etc.) often use 587 + STARTTLS.
  const port = Number(cleanEnv(process.env.SMTP_PORT) || "465");
  const secure =
    cleanEnv(process.env.SMTP_SECURE) === "true" ||
    cleanEnv(process.env.SMTP_SECURE) === "1" ||
    port === 465;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return transporter;
}

export async function sendEmail(
  input: SendEmailInput
): Promise<{ ok: true; messageId: string } | { ok: false; skipped: true }> {
  if (!isMailConfigured()) {
    console.warn("[mail] SMTP not configured — skipped:", input.subject, "→", input.to);
    return { ok: false, skipped: true };
  }

  const info = await getTransporter().sendMail({
    from: getFromAddress(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  return { ok: true, messageId: info.messageId };
}

export async function verifyMailConnection(): Promise<boolean> {
  if (!isMailConfigured()) return false;
  try {
    await getTransporter().verify();
    return true;
  } catch (error) {
    console.error("[mail] SMTP verify failed", error);
    return false;
  }
}
