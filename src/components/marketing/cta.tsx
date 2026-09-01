import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function CTA() {
  return (
    <section className="pb-20 md:pb-28">
      <div className="mx-auto max-w-[1080px] px-6">
        <div className="landing-showcase-gradient relative overflow-hidden rounded-[32px] px-8 py-16 text-center md:px-16 md:py-20">
          {/* Illustrated book stack */}
          <div className="pointer-events-none absolute inset-y-0 left-[-4%] hidden w-[28%] items-center md:flex">
            <div className="relative h-40 w-full">
              <div className="absolute left-[18%] top-4 h-36 w-24 -rotate-12 rounded-md bg-white/20 shadow-lg" />
              <div className="absolute left-[32%] top-0 h-40 w-28 rotate-6 rounded-md bg-[#111]/25 shadow-xl" />
              <div className="absolute left-[48%] top-6 h-32 w-[5.5rem] -rotate-3 rounded-md bg-white/25" />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-[-4%] hidden w-[28%] items-center md:flex">
            <div className="relative ml-auto h-40 w-full">
              <div className="absolute right-[18%] top-8 h-28 w-20 rotate-12 rounded-md bg-white/15" />
              <div className="absolute right-[34%] top-2 h-36 w-24 -rotate-6 rounded-md bg-[#111]/20 shadow-lg" />
            </div>
          </div>

          <h2 className="relative text-[34px] font-bold tracking-[-0.035em] text-white sm:text-[44px]">
            Your next book
            <span className="mt-1 block font-medium text-white/80">
              starts as a sentence.
            </span>
          </h2>
          <Link
            href="/register"
            className="relative mt-9 inline-flex items-center gap-2 rounded-full bg-[#111] px-7 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-[#2a2a2a]"
          >
            Start writing
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
