import type { Metadata } from "next";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { getAppUrl } from "@/lib/book-public";

export const metadata: Metadata = {
  title: "Privacy Policy — BookAI",
  description:
    "BookAI's privacy policy explains how we collect, use, and protect your personal information.",
  alternates: { canonical: `${getAppUrl()}/privacy` },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white pt-[72px]">
        <article className="mx-auto max-w-[720px] px-6 py-14">
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            Privacy Policy
          </h1>
          <p className="mt-2 text-[14px] text-[#697386]">
            Last updated: July 14, 2026
          </p>

          <div className="mt-8 space-y-6 text-[16px] leading-relaxed text-[#425466]">
            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                1. Information we collect
              </h2>
              <p>
                We collect information you provide directly, such as your name,
                email address, and payment details when you create an account
                or subscribe to a plan. We also collect usage data, including
                books generated, pages used, and feature interactions, to
                improve the service and enforce plan limits.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                2. How we use your information
              </h2>
              <p>
                We use your information to provide and maintain BookAI,
                process payments, communicate with you, prevent fraud, and
                improve our product. We do not sell your personal information to
                third parties.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                3. Data storage and security
              </h2>
              <p>
                We use industry-standard encryption and secure cloud providers
                to store your data. While we take reasonable precautions, no
                online service is completely secure. You are responsible for
                keeping your account credentials safe.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                4. Public books
              </h2>
              <p>
                Books you mark as public may be indexed by search engines and
                visible to anyone. Do not include private or sensitive
                information in public books. You can make a book private at any
                time if your plan supports it.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                5. Cookies and analytics
              </h2>
              <p>
                We use cookies and similar technologies to keep you signed in,
                remember preferences, and understand how the product is used.
                You can disable cookies in your browser, though some features
                may not work correctly.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                6. Your rights
              </h2>
              <p>
                Depending on your location, you may have the right to access,
                correct, or delete your personal information. Contact us at the
                email below to make a request.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                7. Changes to this policy
              </h2>
              <p>
                We may update this Privacy Policy from time to time. We will
                notify you of significant changes by email or through the
                product.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-semibold text-[#0a2540]">
                8. Contact us
              </h2>
              <p>
                If you have questions about this Privacy Policy, please contact
                us at support@bookai.example.
              </p>
            </section>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
