import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { SITE_FAQS } from "@/lib/faqs";
import { InView } from "@/components/marketing/home/in-view";

export function HomeFaq() {
  return (
    <section
      id="faq"
      className="scroll-mt-20 border-t border-[#e6ebf1] py-24 md:py-32"
    >
      <InView className="mx-auto grid max-w-[1200px] gap-12 px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="rv home-serif text-[40px] leading-[1.02] text-[#0a2540] sm:text-[52px]">
            Questions?
          </h2>
          <Link
            href="/faq"
            className="rv group mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-[#0a2540]"
            style={{ "--i": 1 } as CSSProperties}
          >
            Full FAQ
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="border-t border-[#e6ebf1]">
          {SITE_FAQS.map((faq, i) => (
            <details
              key={faq.question}
              className="rv group border-b border-[#e6ebf1]"
              style={{ "--i": 1 + i * 0.6 } as CSSProperties}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[17px] font-medium text-[#0a2540] transition-colors hover:text-[#635bff] [&::-webkit-details-marker]:hidden">
                {faq.question}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#e6ebf1] transition-[transform,background-color,border-color,color] duration-300 group-open:rotate-45 group-open:border-[#635bff] group-open:bg-[#635bff] group-open:text-white">
                  <Plus className="h-3.5 w-3.5" />
                </span>
              </summary>
              <p className="-mt-1 max-w-[620px] pb-6 text-[15px] leading-relaxed text-[#697386]">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </InView>
    </section>
  );
}
