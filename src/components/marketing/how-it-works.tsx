"use client";

import { motion, useReducedMotion } from "framer-motion";
import { LandingShowcase } from "@/components/marketing/landing-showcase";

const journey = [
  {
    title: "Spark",
    visual: "spark",
    caption: "One sentence. Genre. Tone.",
  },
  {
    title: "Spine",
    visual: "outline",
    caption: "Chapters & characters take shape.",
  },
  {
    title: "Pages",
    visual: "pages",
    caption: "The manuscript writes itself live.",
  },
  {
    title: "Bound",
    visual: "bound",
    caption: "Cover, export, narrate.",
  },
] as const;

export function HowItWorks() {
  const reduce = useReducedMotion();

  return (
    <section className="landing-section pt-2">
      <div className="mx-auto max-w-[1100px] px-6">
        <h2 className="landing-heading">Watch an idea become a book</h2>

        <div className="relative mx-auto mt-12 max-w-[980px]">
          {/* Path line */}
          <div className="pointer-events-none absolute left-[12%] right-[12%] top-[72px] hidden h-px bg-[#111]/10 md:block" />

          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4 md:gap-4">
            {journey.map((step, i) => (
              <motion.div
                key={step.title}
                className="flex flex-col items-center text-center"
                initial={reduce ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
              >
                <JourneyVisual kind={step.visual} index={i} />
                <p className="mt-4 text-[15px] font-semibold tracking-[-0.02em] text-[#111]">
                  {step.title}
                </p>
                <p className="mt-1 max-w-[160px] text-[13px] leading-snug text-[#6b6b6b]">
                  {step.caption}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="mt-16 md:mt-20">
          <LandingShowcase />
        </div>
      </div>
    </section>
  );
}

function JourneyVisual({
  kind,
  index,
}: {
  kind: (typeof journey)[number]["visual"];
  index: number;
}) {
  if (kind === "spark") {
    return (
      <div className="relative flex h-[120px] w-[120px] items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-[#fff0e0]" />
        <motion.div
          className="absolute h-3 w-3 rounded-full bg-[#f97316]"
          animate={{ scale: [1, 1.35, 1], opacity: [0.9, 0.5, 0.9] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        />
        <svg viewBox="0 0 80 80" className="relative h-16 w-16 text-[#111]/70">
          <path
            d="M28 52c8-18 18-28 28-34-2 12-6 24-14 34-6 8-14 12-22 14 6-4 8-8 8-14z"
            fill="currentColor"
            opacity="0.85"
          />
          <path
            d="M40 18l2 8 8 2-8 2-2 8-2-8-8-2 8-2z"
            fill="#f97316"
          />
        </svg>
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-[#111] px-2 py-0.5 font-mono text-[10px] text-white">
          0{index + 1}
        </span>
      </div>
    );
  }

  if (kind === "outline") {
    return (
      <div className="relative flex h-[120px] w-[120px] items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-[#efeaff]" />
        <svg viewBox="0 0 90 90" className="relative h-[72px] w-[72px]">
          <circle cx="45" cy="22" r="6" fill="#635bff" />
          <circle cx="22" cy="55" r="5" fill="#a78bfa" />
          <circle cx="68" cy="55" r="5" fill="#a78bfa" />
          <circle cx="34" cy="78" r="4" fill="#c4b5fd" />
          <circle cx="56" cy="78" r="4" fill="#c4b5fd" />
          <path
            d="M45 28v18M45 46L24 52M45 46l21 6M28 58l4 14M62 58l-4 14"
            stroke="#635bff"
            strokeWidth="1.5"
            fill="none"
            opacity="0.55"
          />
        </svg>
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-[#111] px-2 py-0.5 font-mono text-[10px] text-white">
          0{index + 1}
        </span>
      </div>
    );
  }

  if (kind === "pages") {
    return (
      <div className="relative flex h-[120px] w-[120px] items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-[#e8f7ef]" />
        <div className="relative h-16 w-14">
          <div className="absolute inset-y-0 left-0 w-[48%] -rotate-6 rounded-sm bg-white shadow-md" />
          <div className="absolute inset-y-0 right-0 w-[52%] rotate-3 rounded-sm bg-[#f8faf8] shadow-lg">
            <div className="space-y-1 p-2 pt-3">
              <div className="h-0.5 w-full bg-[#0e6245]/25" />
              <div className="h-0.5 w-[90%] bg-[#0e6245]/20" />
              <div className="h-0.5 w-full bg-[#0e6245]/20" />
              <motion.div
                className="h-0.5 origin-left bg-[#0e6245]/40"
                animate={{ width: ["20%", "95%", "40%"] }}
                transition={{ duration: 2.4, repeat: Infinity }}
              />
            </div>
          </div>
        </div>
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-[#111] px-2 py-0.5 font-mono text-[10px] text-white">
          0{index + 1}
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex h-[120px] w-[120px] items-center justify-center">
      <div className="absolute inset-0 rounded-full bg-[#fff4e5]" />
      <div className="relative h-[70px] w-[50px]">
        <div
          className="absolute inset-0 rounded-sm shadow-lg"
          style={{
            background:
              "linear-gradient(145deg, #1a1200 0%, #9a6700 45%, #fbbf24 100%)",
          }}
        />
        <div className="absolute inset-y-2 left-0 w-1 bg-black/20" />
        <div className="absolute inset-x-2 bottom-3 space-y-1">
          <div className="h-1 w-8 rounded-full bg-white/35" />
          <div className="h-1 w-5 rounded-full bg-white/25" />
        </div>
      </div>
      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-[#111] px-2 py-0.5 font-mono text-[10px] text-white">
        0{index + 1}
      </span>
    </div>
  );
}
