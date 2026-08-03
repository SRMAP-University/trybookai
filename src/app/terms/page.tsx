import type { Metadata } from "next";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { getAppUrl } from "@/lib/book-public";
import { LEGAL, SUPPORT_EMAIL } from "@/lib/legal";
import { PLANS, PREMIUM_TRIAL, UNLIMITED_FAIR_USE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Terms of Service — BookAI",
  description:
    "BookAI's terms of service outline the rules and responsibilities for using our AI book writing platform.",
  alternates: { canonical: `${getAppUrl()}/terms` },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white pt-[72px]">
        <article className="mx-auto max-w-[720px] px-6 py-14">
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            Terms of Service
          </h1>
          <p className="mt-2 text-[14px] text-[#697386]">
            Last updated: July 28, 2026
          </p>

          <div className="mt-8 space-y-6 text-[16px] leading-relaxed text-[#425466]">
            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                1. Acceptance of terms
              </h2>
              <p>
                By using BookAI, you agree to these Terms of Service. If you do
                not agree, do not use the service. We may update these terms at
                any time, and continued use constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                2. Accounts and eligibility
              </h2>
              <p>
                You must be at least 13 years old to use BookAI. You are
                responsible for maintaining the confidentiality of your account
                credentials and for all activity under your account.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                3. Acceptable use
              </h2>
              <p>
                You may use BookAI to create, edit, and publish original content.
                You may not use the service for illegal activities, spam,
                harassment, copyright infringement, or to generate harmful,
                hateful, or explicit material. We reserve the right to suspend
                accounts that violate these rules.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                4. Content ownership
              </h2>
              <p>
                You retain ownership of the content you create. You grant
                BookAI a limited license to store, display, and process your
                content as necessary to provide the service. Public books may
                be displayed and indexed by search engines.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                5. Subscriptions, trials, and refunds
              </h2>
              <p>
                Paid plans include Pro (${PLANS.PRO.price}/mo), Premium ($
                {PLANS.ENTERPRISE.price}/mo), and Unlimited ($
                {PLANS.UNLIMITED.price}/mo). Plans renew automatically until
                canceled. Premium may include a {PREMIUM_TRIAL.days}-day free
                trial; a payment method is required, and you will be charged the
                plan price when the trial ends unless you cancel first. You may
                cancel anytime from Dashboard → Billing.
              </p>
              <p className="mt-3">
                Refunds and cancellations are described in our{" "}
                <a href={LEGAL.refund} className="text-[#635bff] hover:underline">
                  Refund &amp; Cancellation Policy
                </a>
                . By subscribing, you agree to these Terms, our{" "}
                <a href={LEGAL.privacy} className="text-[#635bff] hover:underline">
                  Privacy Policy
                </a>
                , and Refund Policy.
              </p>
            </section>

            <section id="unlimited-fair-use">
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                6. Unlimited plan — fair use &amp; rate limits
              </h2>
              <p>
                The Unlimited plan ($
                {PLANS.UNLIMITED.price}/mo or $
                {PLANS.UNLIMITED.yearlyPrice}/year) is marketed as unlimited
                pages and audiobook narration for normal authoring. It is{" "}
                <strong>not</strong> a guarantee of infinite compute, storage, or
                concurrent capacity. Soft anti-abuse safeguards and rate limits
                apply. {UNLIMITED_FAIR_USE.note}
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>
                  Concurrent book generations: up to{" "}
                  {UNLIMITED_FAIR_USE.maxConcurrentBookJobs} at a time.
                </li>
                <li>
                  Concurrent audio jobs: up to{" "}
                  {UNLIMITED_FAIR_USE.maxConcurrentAudioJobs} at a time.
                </li>
                <li>
                  New book jobs: up to{" "}
                  {UNLIMITED_FAIR_USE.maxNewBookJobsPerHour} per hour per
                  account.
                </li>
                <li>
                  New audio jobs: up to{" "}
                  {UNLIMITED_FAIR_USE.maxAudioJobsPerHour} per hour per account.
                </li>
                <li>
                  API / dashboard request pacing: about{" "}
                  {UNLIMITED_FAIR_USE.maxApiRequestsPerMinute} requests per
                  minute.
                </li>
                <li>
                  Sustained usage above roughly{" "}
                  {UNLIMITED_FAIR_USE.softReviewPagesPerMonth.toLocaleString()}{" "}
                  pages or{" "}
                  {Math.round(
                    UNLIMITED_FAIR_USE.softReviewAudioMinutesPerMonth / 60
                  )}{" "}
                  hours of audio in a month may trigger a fair-use review,
                  throttling, or a custom enterprise agreement.
                </li>
              </ul>
              <p className="mt-3">
                Prohibited: reselling access, account sharing for capacity
                farming, automated bulk scraping of generation endpoints, or
                bypassing rate limits. We may pause jobs, reduce throughput, or
                suspend accounts that violate this section.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                7. Disclaimers
              </h2>
              <p>
                BookAI is provided &ldquo;as is&rdquo; without warranties of any kind. AI
                output may contain errors or inaccuracies. You are responsible
                for reviewing, fact-checking, and ensuring your content complies
                with applicable laws and platform policies.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                8. Limitation of liability
              </h2>
              <p>
                To the extent permitted by law, BookAI shall not be liable for
                indirect, incidental, or consequential damages arising from
                your use of the service.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                9. Contact us
              </h2>
              <p>
                For questions about these Terms, contact us at{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-[#635bff] hover:underline"
                >
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </section>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
