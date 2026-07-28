import { PLANS, PREMIUM_TRIAL } from "@/lib/constants";
import { LEGAL, SUPPORT_EMAIL } from "@/lib/legal";
import { getAppUrl } from "@/lib/book-public";
import { sendEmail } from "@/lib/mail";

function billingUrl() {
  return `${getAppUrl()}/dashboard/billing`;
}

function legalFooterText() {
  return `Terms: ${getAppUrl()}${LEGAL.terms}
Privacy: ${getAppUrl()}${LEGAL.privacy}
Refunds: ${getAppUrl()}${LEGAL.refund}`;
}

function legalFooterHtml() {
  const base = getAppUrl();
  return `<p style="margin:24px 0 0;font-size:12px;color:#697386;line-height:1.6">
    By using BookAI you agreed to our
    <a href="${base}${LEGAL.terms}">Terms</a>,
    <a href="${base}${LEGAL.privacy}">Privacy Policy</a>, and
    <a href="${base}${LEGAL.refund}">Refund Policy</a>.
    Questions? <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
  </p>`;
}

function emailLayout(title: string, bodyHtml: string) {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0a2540;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f9fc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6ebf1;border-radius:12px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#635bff;letter-spacing:0.02em;">BOOKAI</p>
                <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;line-height:1.3;">${title}</h1>
                ${bodyHtml}
                ${legalFooterHtml()}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendTrialStartedEmail(input: {
  to: string;
  name?: string | null;
  trialEndsAt: Date;
  interval: "month" | "year";
}) {
  const greeting = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi,";
  const chargeAmount =
    input.interval === "year"
      ? PLANS.ENTERPRISE.yearlyPrice
      : PLANS.ENTERPRISE.price;
  const period = input.interval === "year" ? "year" : "month";
  const ends = input.trialEndsAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

  const subject = `Your BookAI Premium trial started (${PREMIUM_TRIAL.days} days free)`;
  const text = `${greeting}

Your BookAI Premium free trial is active for ${PREMIUM_TRIAL.days} days.

Trial ends: ${ends} UTC
After that: USD $${chargeAmount}/${period} unless you cancel before the trial ends.

Cancel anytime: ${billingUrl()}

${legalFooterText()}`;

  const html = emailLayout(
    "Premium trial started",
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#425466;">${greeting}</p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#425466;">
       Your <strong>Premium</strong> free trial is active for <strong>${PREMIUM_TRIAL.days} days</strong>.
       No charge today — a valid payment method is on file for when the trial ends.
     </p>
     <table style="width:100%;margin:0 0 20px;background:#f6f9fc;border-radius:8px;padding:16px;font-size:14px;color:#425466;">
       <tr><td style="padding:4px 0;"><strong>Trial ends</strong></td><td style="padding:4px 0;text-align:right;">${ends} UTC</td></tr>
       <tr><td style="padding:4px 0;"><strong>Then</strong></td><td style="padding:4px 0;text-align:right;">$${chargeAmount}/${period}</td></tr>
     </table>
     <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#425466;">
       Cancel before the trial ends to avoid charges.
     </p>
     <a href="${billingUrl()}" style="display:inline-block;background:#635bff;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;">
       Manage billing
     </a>`
  );

  return sendEmail({ to: input.to, subject, html, text });
}

export async function sendTrialEndingReminderEmail(input: {
  to: string;
  name?: string | null;
  trialEndsAt: Date;
  interval: "month" | "year";
}) {
  const greeting = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi,";
  const chargeAmount =
    input.interval === "year"
      ? PLANS.ENTERPRISE.yearlyPrice
      : PLANS.ENTERPRISE.price;
  const period = input.interval === "year" ? "year" : "month";
  const ends = input.trialEndsAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

  const subject = `Reminder: BookAI trial ends soon — $${chargeAmount}/${period} unless you cancel`;
  const text = `${greeting}

Your BookAI Premium trial ends soon (${ends} UTC).

If you keep Premium, your card will be charged USD $${chargeAmount}/${period} when the trial ends.

To avoid charges, cancel before then: ${billingUrl()}

${legalFooterText()}`;

  const html = emailLayout(
    "Your trial ends soon",
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#425466;">${greeting}</p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#425466;">
       This is a reminder that your <strong>BookAI Premium</strong> free trial ends on
       <strong>${ends} UTC</strong>.
     </p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#425466;">
       Unless you cancel, your payment method will be charged
       <strong>$${chargeAmount}/${period}</strong> when the trial converts to a paid subscription.
     </p>
     <a href="${billingUrl()}" style="display:inline-block;background:#635bff;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;">
       Cancel or manage billing
     </a>`
  );

  return sendEmail({ to: input.to, subject, html, text });
}

export async function sendWelcomeEmail(input: {
  to: string;
  name?: string | null;
}) {
  const greeting = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi,";
  const dashboard = `${getAppUrl()}/dashboard`;

  const subject = "Welcome to BookAI";
  const text = `${greeting}

Welcome to BookAI — start writing at ${dashboard}

${legalFooterText()}`;

  const html = emailLayout(
    "Welcome to BookAI",
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#425466;">${greeting}</p>
     <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#425466;">
       Your account is ready. Open your dashboard to create your first book.
     </p>
     <a href="${dashboard}" style="display:inline-block;background:#635bff;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;">
       Go to dashboard
     </a>`
  );

  return sendEmail({ to: input.to, subject, html, text });
}
