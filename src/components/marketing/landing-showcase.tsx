"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const TABS = ["Outline", "Generate", "Editor", "Review", "Export"] as const;

const PANEL: Record<
  (typeof TABS)[number],
  { title: string; lines: string[]; accent: string }
> = {
  Outline: {
    title: "Chapter map",
    lines: [
      "I. The Archive Door",
      "II. Dust & Filament",
      "III. What the Index Forgot",
      "IV. The Night Catalog",
    ],
    accent: "#4ade80",
  },
  Generate: {
    title: "Writing live",
    lines: [
      "The archive had no windows.",
      "Elena worked by lamplight alone,",
      "turning pages that refused to stay still…",
    ],
    accent: "#a78bfa",
  },
  Editor: {
    title: "Refine a chapter",
    lines: [
      "Rewrite tone → warmer",
      "Tighten dialogue in §2",
      "Keep character voice: Elena",
    ],
    accent: "#60a5fa",
  },
  Review: {
    title: "Consistency check",
    lines: [
      "Canon: archive has no windows ✓",
      "Open thread: missing ledger",
      "Tone: literary mystery",
    ],
    accent: "#c084fc",
  },
  Export: {
    title: "Ready to ship",
    lines: ["PDF · branded footer", "EPUB · chapter nav", "Audiobook · 12 tracks"],
    accent: "#fdba74",
  },
};

const SEGMENTS = [
  { label: "Outline", pct: 18, color: "#4ade80" },
  { label: "Writing", pct: 52, color: "#a78bfa" },
  { label: "Review", pct: 18, color: "#c084fc" },
  { label: "Export", pct: 12, color: "#fdba74" },
];

export function LandingShowcase() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Generate");
  const reduce = useReducedMotion();
  const panel = PANEL[activeTab];

  return (
    <div className="relative mx-auto w-full max-w-[1040px]">
      <div className="landing-showcase-gradient relative min-h-[440px] overflow-hidden rounded-[32px] p-5 sm:p-8 md:min-h-[500px]">
        {/* Soft book shapes in the background */}
        <div className="pointer-events-none absolute -right-8 top-16 h-48 w-36 rotate-12 rounded-md bg-white/10 blur-[1px]" />
        <div className="pointer-events-none absolute right-16 top-28 h-56 w-40 -rotate-6 rounded-md bg-black/10" />

        <div className="relative z-10 flex flex-wrap gap-1 rounded-full bg-black/15 p-1 backdrop-blur-sm sm:inline-flex">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2 text-[13px] font-medium transition-all sm:px-5 ${
                activeTab === tab
                  ? "bg-white text-[#111] shadow-sm"
                  : "text-white/90 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="relative z-10 mt-8 grid gap-6 lg:grid-cols-[1fr_minmax(0,380px)] lg:items-start">
          <div className="max-w-[420px] rounded-[22px] bg-[#141414] p-5 shadow-[0_24px_48px_rgba(0,0,0,0.28)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[15px] font-semibold text-white">
                  Chapter distribution
                </p>
                <p className="mt-1 text-[12px] text-white/50">24 chapters · live</p>
              </div>
              <span
                className="rounded-full px-2.5 py-1 font-mono text-[11px] text-white/80"
                style={{ backgroundColor: `${panel.accent}33` }}
              >
                {activeTab}
              </span>
            </div>

            <div className="mt-5 flex h-3 overflow-hidden rounded-full">
              {SEGMENTS.map((seg) => (
                <div
                  key={seg.label}
                  style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}
                />
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
              {SEGMENTS.map((seg) => (
                <div key={seg.label} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">
                    {seg.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Mini page stack illustration */}
            <div className="mt-6 flex items-end gap-2 pl-1">
              {[40, 56, 72, 48, 64].map((h, i) => (
                <motion.div
                  key={i}
                  className="w-7 rounded-t-sm bg-white/15"
                  style={{ height: h }}
                  animate={
                    reduce
                      ? undefined
                      : { height: [h, h + 8, h], opacity: [0.5, 0.85, 0.5] }
                  }
                  transition={{
                    duration: 2.2 + i * 0.2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={reduce ? false : { opacity: 0, y: 12, rotate: 1 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.28 }}
              className="rounded-[22px] border border-white/40 bg-white p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)] sm:p-6 lg:mt-10"
            >
              <p className="font-mono text-[11px] text-[#6b6b6b]">
                # BookAI · {panel.title}
              </p>
              <div className="mt-4 space-y-2.5">
                {panel.lines.map((line) => (
                  <p
                    key={line}
                    className="rounded-lg px-2.5 py-1.5 font-mono text-[12px] leading-relaxed text-[#374151]"
                    style={{ backgroundColor: `${panel.accent}18` }}
                  >
                    {line}
                  </p>
                ))}
              </div>
              <div
                className="mt-5 h-1 w-16 rounded-full"
                style={{ backgroundColor: panel.accent }}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-mark.png"
      alt="BookAI"
      className={className}
      aria-hidden
    />
  );
}
