"use client";

import { useState } from "react";

const TABS = ["Outline", "Generate", "Editor", "Review", "Export"] as const;

const SEGMENTS = [
  { label: "Outline", pct: 18, color: "#4ade80" },
  { label: "Writing", pct: 52, color: "#a78bfa" },
  { label: "Review", pct: 18, color: "#c084fc" },
  { label: "Export", pct: 12, color: "#fdba74" },
];

export function LandingShowcase() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Generate");

  return (
    <div className="relative mx-auto w-full max-w-[1040px] px-4">
      <div className="landing-showcase-gradient relative min-h-[420px] overflow-hidden rounded-[28px] p-5 sm:p-7 md:min-h-[480px] md:p-8">
        {/* Tabs */}
        <div className="flex flex-wrap gap-1 rounded-full bg-black/10 p-1 backdrop-blur-sm sm:inline-flex">
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

        {/* Dark distribution card */}
        <div className="relative z-10 mt-8 max-w-[420px] rounded-[20px] bg-[#141414] p-5 shadow-[0_24px_48px_rgba(0,0,0,0.25)] sm:mt-10 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[15px] font-semibold text-white">
                Chapter distribution
              </p>
              <p className="mt-1 text-[12px] text-white/50">
                24 total chapters
              </p>
            </div>
            <span className="rounded-full bg-white/10 px-2.5 py-1 font-mono text-[11px] text-white/70">
              Live
            </span>
          </div>

          <div className="mt-5 flex h-3 overflow-hidden rounded-full">
            {SEGMENTS.map((seg) => (
              <div
                key={seg.label}
                style={{
                  width: `${seg.pct}%`,
                  backgroundColor: seg.color,
                }}
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
        </div>
      </div>

      {/* Manuscript panel — overlaps right */}
      <div className="relative z-20 mx-auto -mt-16 w-[92%] max-w-[480px] rounded-[20px] border border-[#e8e8e6] bg-white p-5 shadow-[0_20px_60px_rgba(0,0,0,0.12)] sm:absolute sm:right-0 sm:top-[28%] sm:mx-0 sm:-mr-4 sm:w-[min(440px,46%)] md:-mr-8 lg:-mr-12">
        <p className="font-mono text-[11px] text-[#6b6b6b]">
          # BookAI · Chapter 12 draft
        </p>
        <div className="mt-4 space-y-2 font-mono text-[12px] leading-relaxed">
          <p className="text-[#111]">
            <span className="text-[#6b6b6b]">@@</span> The Silent Archive
          </p>
          <p className="rounded-md bg-[#fff7ed] px-2 py-1 text-[#9a3412]">
            + Chapter XII — What the Dust Remembered
          </p>
          <p className="text-[#374151]">
            The archive had no windows. Elena worked by lamplight alone.
          </p>
        </div>
      </div>

      <div className="h-24 sm:h-0" aria-hidden />
    </div>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src="/LOGO.png"
      alt="BookAI"
      className={className}
      aria-hidden
    />
  );
}
