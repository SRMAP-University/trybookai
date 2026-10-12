"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { LandingCoverBook } from "@/lib/landing-covers";
import { HomeCover } from "@/components/marketing/home/home-cover";

const SHUFFLE_MS = 3000;

/**
 * Deck slots. Every card sits where the front card does (58% wide, centred);
 * these transforms move and shrink it into place, so slot changes animate on
 * the compositor. Back cards scale to 42% of the stage (0.42 / 0.58).
 */
const SLOTS = {
  front: { transform: "translate(0, 0) rotate(0deg) scale(1)", zIndex: 30, opacity: 1 },
  right: { transform: "translate(50%, 7%) rotate(7deg) scale(0.724)", zIndex: 20, opacity: 1 },
  left: { transform: "translate(-50%, 2.5%) rotate(-8deg) scale(0.724)", zIndex: 10, opacity: 1 },
  hidden: { transform: "translate(0, 6%) rotate(0deg) scale(0.62)", zIndex: 0, opacity: 0 },
} as const;

type Slot = keyof typeof SLOTS;

/** Order the first hand is dealt in on page load. */
const DEAL_ORDER: Record<Slot, number> = { front: 0, left: 1, right: 2, hidden: 3 };

/**
 * A card's slot from its distance to the front of the deck. Each shuffle moves
 * every card one step: right → front → left → tucked behind → … → right.
 */
function slotFor(offset: number, count: number): Slot {
  if (offset === 0) return "front";
  if (offset === 1) return "right";
  if (offset === count - 1) return "left";
  return "hidden";
}

export function HeroCovers({ covers }: { covers: LandingCoverBook[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const count = covers.length;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) =>
      setOnScreen(entry.isIntersecting)
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (count < 2 || hovered || !onScreen) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setStep((s) => s + 1), SHUFFLE_MS);
    return () => clearInterval(id);
  }, [count, hovered, onScreen]);

  return (
    <div
      ref={ref}
      className="mx-auto w-full max-w-[380px] sm:max-w-[460px]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative aspect-[10/9] w-full">
        {covers.map((book, i) => {
          const slot = slotFor((((i - step) % count) + count) % count, count);
          return (
            <div
              key={book.id}
              className="home-slot absolute left-[21%] top-0 w-[58%]"
              style={SLOTS[slot]}
              aria-hidden={slot === "hidden" || undefined}
            >
              <div
                className="home-deal"
                style={{ "--i": DEAL_ORDER[slotFor(i, count)] } as CSSProperties}
              >
                <div
                  className="home-float"
                  style={
                    { "--i": i, "--dur": `${6 + (i % 3) * 0.5}s` } as CSSProperties
                  }
                >
                  <HomeCover book={book} index={i} priority={i < 3} />
                </div>
              </div>
            </div>
          );
        })}

        {/* Live-status chips */}
        <div
          aria-hidden
          className="home-fan absolute -left-2 bottom-[8%] z-40 sm:-left-6"
          style={{ "--i": 4 } as CSSProperties}
        >
          <div
            className="home-float flex items-center gap-2 rounded-full border border-[#e6ebf1] bg-white px-3.5 py-2 text-[12.5px] font-medium text-[#0a2540] shadow-[0_10px_30px_-12px_rgba(10,37,64,0.35)]"
            style={{ "--i": 3, "--dur": "5.5s" } as CSSProperties}
          >
            <span className="home-pulse h-2 w-2 rounded-full bg-[#16a34a]" />
            Writing chapter 12
          </div>
        </div>
        <div
          aria-hidden
          className="home-fan absolute -right-2 top-[2%] z-40 sm:-right-6"
          style={{ "--i": 5 } as CSSProperties}
        >
          <div
            className="home-float flex items-center gap-2.5 rounded-full bg-[#0a2540] px-3.5 py-2 text-[12.5px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(10,37,64,0.5)]"
            style={{ "--i": 4, "--dur": "6s" } as CSSProperties}
          >
            <span className="flex h-3 items-end gap-[2px]">
              {[0, 1, 2, 3].map((bar) => (
                <span
                  key={bar}
                  className="home-eq h-full w-[2.5px] rounded-full bg-[#c9c5ff]"
                  style={{ "--i": bar } as CSSProperties}
                />
              ))}
            </span>
            Audiobook
          </div>
        </div>
      </div>
    </div>
  );
}
