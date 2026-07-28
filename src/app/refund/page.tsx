import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { getAppUrl } from "@/lib/book-public";
import { LEGAL, SUPPORT_EMAIL } from "@/lib/legal";
import { PLANS, PREMIUM_TRIAL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy — BookAI",
  description:
    "BookAI refund and cancellation policy for subscriptions, free trials, and one-time purchases.",
  alternates: { canonical: `${getAppUrl()}${LEGAL.refund}` },
  robots: { index: true, follow: true },
};

export default function RefundPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white pt-[72px]">
        <article className="mx-auto max-w-[720px] px-6 py-14">
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            Refund &amp; Cancellation Policy
          </h1>
          <p className="mt-2 text-[14px] text-[#697386]">
            Last updated: July 24, 2026
          </p>

          <div className="mt-8 space-y-6 text-[16px] leading-relaxed text-[#425466]">
            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                1. Overview
              </h2>
              <p>
                This policy explains how subscriptions, free trials, and
                one-time purchases on BookAI are billed, canceled, and refunded.
                By starting a subscription or trial, you agree to this policy along
                with our{" "}
                <Link href={LEGAL.terms} className="text-[#635bff] hover:underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href={LEGAL.privacy}
                  className="text-[#635bff] hover:underline"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                2. Subscriptions
              </h2>
              <p>
                BookAI offers paid plans including Pro (${PLANS.PRO.price}/month
                or ${PLANS.PRO.yearlyPrice}/year) and Premium ($
                {PLANS.ENTERPRISE.price}/month or $
                {PLANS.ENTERPRISE.yearlyPrice}/year). Subscriptions renew
                automatically at the end of each billing period until canceled.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                3. Premium free trial
              </h2>
              <p>
                New Premium subscribers may receive a {PREMIUM_TRIAL.days}-day
                free trial. During the trial, you are not charged the
                subscription price. A valid payment method is required to start
                the trial. Unless you cancel before the trial ends, your
                subscription converts to a paid plan and your payment method is
                charged the displayed plan price (e.g. ${PLANS.ENTERPRISE.price}
                /month for Premium monthly) at the end of the trial period.
              </p>
              <p className="mt-3">
                Trial limits and features are shown on the{" "}
                <Link
                  href="/dashboard/billing"
                  className="text-[#635bff] hover:underline"
                >
                  billing page
                </Link>{" "}
                at checkout.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                4. Cancellation
              </h2>
              <p>
                You may cancel your subscription at any time from{" "}
                <strong>Dashboard → Billing</strong> using the Stripe customer
                portal. Cancellation stops future renewals. You retain access to
                paid features until the end of your current billing period (or
                until the trial ends if canceled during a trial). We do not
                provide partial-period refunds for unused time after
                cancellation unless required by law.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                5. Refunds
              </h2>
              <p>
                Subscription charges are generally non-refundable once a billing
                period has started, except where required by applicable law or
                at our discretion for billing errors or unauthorized charges.
              </p>
              <p className="mt-3">
                If you believe you were charged in error, contact us at{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-[#635bff] hover:underline"
                >
                  {SUPPORT_EMAIL}
                </a>{" "}
                within 14 days of the charge with your account email and
                transaction details. We review requests case by case.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                6. One-time capacity purchases
              </h2>
              <p>
                Extra page packs and audiobook minutes are one-time purchases
                charged immediately. These add-ons are non-refundable once
                credits have been applied to your account, except for duplicate
                or erroneous charges.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                7. Contact
              </h2>
              <p>
                Questions about billing, cancellation, or refunds:{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-[#635bff] hover:underline"
                >
                  {SUPPORT_EMAIL}
                </a>
              </p>
            </section>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
