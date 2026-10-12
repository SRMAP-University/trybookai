import type { CSSProperties } from "react";
import type { LandingCoverBook } from "@/lib/landing-covers";
import { HeroComposer } from "@/components/marketing/home/hero-composer";
import { HeroCovers } from "@/components/marketing/home/hero-covers";

const HEADLINE = ["From", "one", "idea", "to", "a", "finished", "book."];
const ACCENT_WORD = "finished";

const delay = (i: number) => ({ "--i": i }) as CSSProperties;

export function HomeHero({ covers }: { covers: LandingCoverBook[] }) {
  return (
    <section className="hero-glow px-6 pb-20 pt-[112px] md:pb-28 md:pt-[148px]">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12">
        <div className="min-w-0 max-w-[600px]">
          <p className="home-eyebrow home-rise">The AI book studio</p>
          <h1 className="home-serif mt-5 text-[52px] leading-[0.96] text-[#0a2540] sm:text-[68px] lg:text-[84px]">
            {HEADLINE.map((word, i) => (
              <span key={word}>
                <span
                  className={
                    word === ACCENT_WORD
                      ? "home-word italic text-[#635bff]"
                      : "home-word"
                  }
                  style={delay(i)}
                >
                  {word}
                </span>{" "}
              </span>
            ))}
          </h1>
          <p
            className="home-rise mt-6 max-w-[440px] text-[17px] leading-relaxed text-[#425466]"
            style={delay(6)}
          >
            Outline, write, cover and narrate — a whole book from one premise.
          </p>
          <div className="home-rise mt-9" style={delay(8)}>
            <HeroComposer />
          </div>
        </div>

        {covers.length > 0 && <HeroCovers covers={covers} />}
      </div>
    </section>
  );
}
