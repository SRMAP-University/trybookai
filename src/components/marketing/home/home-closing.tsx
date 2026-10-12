import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LandingCoverBook } from "@/lib/landing-covers";
import { HomeCover } from "@/components/marketing/home/home-cover";
import { InView } from "@/components/marketing/home/in-view";

// Covers rise from the bottom edge of the panel and bleed off it.
const STACK = [
  { className: "right-[270px] -bottom-[84px] w-[168px] -rotate-[9deg]", dur: "7s" },
  { className: "right-[-14px] -bottom-[96px] w-[168px] rotate-[10deg]", dur: "6.5s" },
  { className: "right-[118px] -bottom-[48px] w-[196px] rotate-[2deg]", dur: "6s" },
] as const;

export function HomeClosing({ covers }: { covers: LandingCoverBook[] }) {
  return (
    <section className="px-6 pb-20 md:pb-28">
      <InView className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[28px] bg-[#0a2540] px-8 py-16 sm:px-12 md:px-16 md:py-24">
        <div className="relative z-10 max-w-[560px]">
          <h2 className="rv home-serif text-[44px] leading-[1] text-white sm:text-[64px]">
            Your next book starts as a{" "}
            <em className="italic text-[#c9c5ff]">sentence.</em>
          </h2>
          <Link
            href="/register"
            className="rv group mt-10 inline-flex items-center gap-2 rounded-full bg-[#635bff] px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-[#5851e5]"
            style={{ "--i": 2 } as CSSProperties}
          >
            Start writing
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[460px] xl:block"
        >
          {covers.slice(0, STACK.length).map((book, i) => (
            <div
              key={book.id}
              className={`rv absolute ${STACK[i].className}`}
              style={{ "--i": 2 + i * 1.5 } as CSSProperties}
            >
              <div
                className="home-float"
                style={{ "--i": i, "--dur": STACK[i].dur } as CSSProperties}
              >
                <HomeCover book={book} index={i} decorative />
              </div>
            </div>
          ))}
        </div>
      </InView>
    </section>
  );
}
