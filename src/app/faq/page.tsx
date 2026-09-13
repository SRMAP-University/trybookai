import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { JsonLd } from "@/components/seo/json-ld";
import { SITE_FAQS } from "@/lib/faqs";
import {
  breadcrumbJsonLd,
  buildPageMetadata,
  faqPageJsonLd,
} from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "FAQ",
  description:
    "Answers about BookAI: how AI book generation works, exports, audiobooks, the free plan, ownership, and public book pages.",
  path: "/faq",
  keywords: [
    "BookAI FAQ",
    "AI book generator questions",
    "how to write a book with AI",
    "AI audiobook",
    "export AI book PDF EPUB",
  ],
});

export default function FaqPage() {
  return (
    <>
      <JsonLd data={faqPageJsonLd()} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "FAQ", path: "/faq" },
        ])}
      />
      <Navbar />
      <main className="min-h-screen bg-white pt-[72px]">
        <article className="mx-auto max-w-[720px] px-6 py-14">
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            Frequently asked questions
          </h1>
          <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-[#697386]">
            How BookAI writes books, what you can export, and how publishing on
            the public library works.
          </p>

          <div className="mt-10 divide-y divide-[#e6ebf1] border-y border-[#e6ebf1]">
            {SITE_FAQS.map((faq) => (
              <section key={faq.question} className="py-6">
                <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#0a2540]">
                  {faq.question}
                </h2>
                <p className="mt-2 text-[15px] leading-relaxed text-[#425466]">
                  {faq.answer}
                </p>
              </section>
            ))}
          </div>

          <p className="mt-10 text-[15px] text-[#697386]">
            Ready to try it?{" "}
            <Link href="/register" className="font-medium text-[#635bff] hover:underline">
              Create a free account
            </Link>{" "}
            or{" "}
            <Link href="/books" className="font-medium text-[#635bff] hover:underline">
              browse public books
            </Link>
            .
          </p>
        </article>
      </main>
      <Footer />
    </>
  );
}
