import Link from "next/link";
import { SITE_FAQS } from "@/lib/faqs";

export function FaqSection() {
  return (
    <section id="faq" className="landing-section">
      <div className="mx-auto max-w-[720px] px-6">
        <h2 className="landing-heading">Questions authors ask</h2>
        <p className="mx-auto mt-3 max-w-md text-center text-[15px] text-[#6b6b6b]">
          How BookAI writes, exports, and publishes books.
        </p>
        <div className="mt-10 divide-y divide-[#e8e8e6] border-y border-[#e8e8e6]">
          {SITE_FAQS.map((faq) => (
            <div key={faq.question} className="py-5">
              <h3 className="text-[16px] font-semibold text-[#111]">
                {faq.question}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#6b6b6b]">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-[14px] text-[#6b6b6b]">
          <Link href="/faq" className="font-medium text-[#111] hover:underline">
            Open the full FAQ
          </Link>
        </p>
      </div>
    </section>
  );
}
