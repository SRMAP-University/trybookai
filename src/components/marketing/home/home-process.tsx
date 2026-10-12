import type { CSSProperties, ReactNode } from "react";
import { Check } from "lucide-react";
import type { LandingCoverBook } from "@/lib/landing-covers";
import { HomeCover } from "@/components/marketing/home/home-cover";
import { InView } from "@/components/marketing/home/in-view";

const OUTLINE = [
  ["I", "The Keeper's Log"],
  ["II", "Salt on the Envelopes"],
  ["III", "The Manifest"],
  ["IV", "What the Tide Returned"],
] as const;

const FORMATS = ["PDF", "EPUB", "Audiobook"] as const;

const delay = (i: number) => ({ "--i": i }) as CSSProperties;

export function HomeProcess({ cover }: { cover?: LandingCoverBook }) {
  const steps: { title: string; artifact: ReactNode }[] = [
    {
      title: "Premise",
      artifact: (
        <>
          <p className="home-serif text-[22px] leading-[1.2] text-[#0a2540]">
            “A lighthouse keeper starts receiving letters from a ship that sank
            in 1911.”
          </p>
          <div className="mt-auto flex flex-wrap gap-1.5">
            {["Mystery", "Literary", "Adult"].map((tag, i) => (
              <span
                key={tag}
                className="rv rv-pop rounded-full bg-[#f0efff] px-2.5 py-1 text-[11.5px] font-medium text-[#635bff]"
                style={delay(4 + i)}
              >
                {tag}
              </span>
            ))}
          </div>
        </>
      ),
    },
    {
      title: "Outline",
      artifact: (
        <ol className="space-y-3 text-[14px]">
          {OUTLINE.map(([numeral, title], i) => (
            <li
              key={numeral}
              className="rv rv-slide flex gap-3"
              style={delay(4 + i * 2)}
            >
              <span className="home-serif w-7 shrink-0 text-[17px] leading-[1.2] text-[#635bff]">
                {numeral}
              </span>
              <span className="text-[#0a2540]">{title}</span>
            </li>
          ))}
        </ol>
      ),
    },
    {
      title: "Write",
      artifact: (
        <>
          <p
            className="rv rv-lines home-serif text-[16.5px] leading-[1.5] text-[#425466]"
            style={delay(6)}
          >
            The third letter arrived on a calm night, which was the first thing
            wrong with it. No boat had come to the rock in eleven days, and yet
            there it lay on the stair — dry as bone, addressed in a hand he had
            begun to know.
          </p>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
        </>
      ),
    },
    {
      title: "Publish",
      artifact: (
        <div className="flex h-full items-center gap-5">
          {cover && (
            <div className="rv rv-pop w-[96px] shrink-0" style={delay(5)}>
              <HomeCover book={cover} decorative />
            </div>
          )}
          <ul className="flex-1 space-y-3">
            {FORMATS.map((format, i) => (
              <li
                key={format}
                className="rv rv-slide flex items-center gap-2.5 text-[14px] font-medium text-[#0a2540]"
                style={delay(7 + i * 2)}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#635bff] text-white">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {format}
              </li>
            ))}
          </ul>
        </div>
      ),
    },
  ];

  return (
    <section className="pb-24 md:pb-32">
      <InView className="mx-auto max-w-[1200px] px-6">
        <h2 className="rv home-serif max-w-[640px] text-[40px] leading-[1.02] text-[#0a2540] sm:text-[56px]">
          One sentence in.
          <br />
          <span className="text-[#697386]">A whole book out.</span>
        </h2>

        <ol className="mt-14 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.title} className="rv" style={delay(1 + i)}>
              <div className="relative flex h-[216px] flex-col overflow-hidden rounded-2xl border border-[#e6ebf1] bg-white p-5 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(10,37,64,0.35)]">
                {step.artifact}
              </div>
              <div className="mt-5 flex items-baseline gap-3">
                <span className="font-mono text-[12px] text-[#635bff]">
                  0{i + 1}
                </span>
                <h3 className="home-serif text-[28px] leading-none text-[#0a2540]">
                  {step.title}
                </h3>
              </div>
            </li>
          ))}
        </ol>
      </InView>
    </section>
  );
}
