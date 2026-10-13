"use client";

import { useEffect, useRef } from "react";
import { Headphones } from "lucide-react";

/** Thin bar along the top of the window showing how far through the book the reader is. */
export function ReadingProgress({ targetId }: { targetId: string }) {
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const target = document.getElementById(targetId);
      const bar = barRef.current;
      if (!target || !bar) return;
      const rect = target.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const done = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      bar.style.transform = `scaleX(${done})`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [targetId]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]" aria-hidden>
      <div ref={barRef} className="h-full origin-left scale-x-0 bg-[#635bff]" />
    </div>
  );
}

/** Opens the collapsed "Listen" section and scrolls to it. */
export function ListenButton({ targetId, className }: { targetId: string; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const details = document.getElementById(targetId);
        if (details instanceof HTMLDetailsElement) details.open = true;
        details?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      <Headphones className="h-4 w-4" />
      Listen
    </button>
  );
}
