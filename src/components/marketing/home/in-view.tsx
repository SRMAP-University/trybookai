"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Scroll-reveal boundary. Children with `.rv` classes animate in (see
 * landing.css) the first time this block scrolls into view. Blocks already on
 * screen at mount are left alone, and nothing is hidden before hydration.
 */
export function InView({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    el.setAttribute("data-armed", "");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.setAttribute("data-inview", "");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -15% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
