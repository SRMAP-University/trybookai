"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { LandingCoverBook } from "@/lib/landing-covers";
import {
  BookCoverCard,
  CoverBubble,
} from "@/components/marketing/book-cover-card";

const FAN = [
  { rotate: -22, y: 18, bubble: true, z: 1 },
  { rotate: -13, y: 4, bubble: false, z: 2 },
  { rotate: -5, y: -8, bubble: true, z: 3 },
  { rotate: 5, y: -8, bubble: false, z: 4 },
  { rotate: 13, y: 4, bubble: true, z: 5 },
  { rotate: 22, y: 18, bubble: false, z: 6 },
] as const;

type LandingExperienceProps = {
  covers: LandingCoverBook[];
};

export function LandingExperience({ covers }: LandingExperienceProps) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const heroCovers = covers.slice(0, 6);
  const shelfCovers = covers.slice(0, 8);

  function handlePromptSubmit(e: FormEvent) {
    e.preventDefault();
    const q = prompt.trim();
    if (q) {
      router.push(`/register?prompt=${encodeURIComponent(q.slice(0, 500))}`);
    } else {
      router.push("/register");
    }
  }

  return (
    <>
      <section className="relative overflow-hidden px-6 pb-16 pt-[88px] md:pb-20 md:pt-[104px]">
        <div className="relative mx-auto max-w-[1100px] text-center">
          <motion.p
            className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#111]/50"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            BookAI
          </motion.p>
          <motion.h1
            className="mx-auto mt-3 max-w-[720px] text-[32px] font-bold leading-[1.08] tracking-[-0.04em] text-[#111] sm:text-[40px] md:text-[48px]"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
          >
            From one idea to a finished book.
          </motion.h1>
          <motion.p
            className="mx-auto mt-3 max-w-[440px] text-[14px] leading-relaxed text-[#6b6b6b] sm:text-[15px]"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
          >
            Outline, write, cover, and narrate — a full manuscript from a single
            premise.
          </motion.p>

          {/* Floating cover stage — main visual */}
          <div className="landing-book-stage relative mx-auto mt-6 h-[200px] max-w-[760px] sm:mt-8 sm:h-[240px] md:h-[280px]">
            <div className="absolute inset-x-[8%] bottom-0 h-8 rounded-[100%] bg-[#111]/10 blur-xl" />
            <div className="absolute inset-0 flex items-end justify-center pb-2">
              {heroCovers.map((book, i) => {
                const base = FAN[i].rotate;
                return (
                  <motion.div
                    key={book.id}
                    className="relative w-[84px] shrink-0 sm:w-[104px] md:w-[118px]"
                    initial={
                      reduce
                        ? false
                        : {
                            opacity: 0,
                            y: 48,
                            rotate: base,
                            marginLeft: i === 0 ? 0 : -34,
                          }
                    }
                    animate={{
                      opacity: 1,
                      y: FAN[i].y,
                      rotate: reduce
                        ? base
                        : [base - 2.5, base + 2.5, base - 2.5],
                      marginLeft: i === 0 ? 0 : -34,
                    }}
                    transition={{
                      opacity: { duration: 0.55, delay: 0.12 + i * 0.05 },
                      y: { duration: 0.7, delay: 0.12 + i * 0.05 },
                      rotate: {
                        duration: 5 + i * 0.55,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 0.8,
                      },
                    }}
                    style={{ zIndex: FAN[i].z }}
                  >
                    {FAN[i].bubble && (
                      <motion.div
                        className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-[120%]"
                        initial={reduce ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 + i * 0.08 }}
                      >
                        <CoverBubble book={book} index={i} />
                      </motion.div>
                    )}
                    <BookCoverCard
                      book={book}
                      index={i}
                      variant="art"
                      className="aspect-[3/4] w-full shadow-[0_20px_50px_rgba(0,0,0,0.22)]"
                    />
                  </motion.div>
                );
              })}
            </div>
          </div>

          <form
            onSubmit={handlePromptSubmit}
            className="relative mx-auto mt-8 w-full max-w-[560px] text-left sm:mt-10"
          >
            <label htmlFor="hero-prompt" className="sr-only">
              Book idea
            </label>
            <textarea
              id="hero-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder="A mystery set in a lighthouse…"
              className="w-full resize-none rounded-[22px] border border-[#e8e8e6] bg-white/90 px-5 py-4 text-[15px] leading-relaxed text-[#111] shadow-[0_12px_40px_rgba(0,0,0,0.06)] outline-none backdrop-blur placeholder:text-[#9a9a9a] transition-[border-color,box-shadow] focus:border-[#111] focus:shadow-[0_12px_40px_rgba(0,0,0,0.1)]"
            />
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <button type="submit" className="landing-btn-dark">
                Start writing
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link href="/books" className="landing-btn-light">
                Browse books
              </Link>
            </div>
          </form>
        </div>
      </section>

      {/* Single workspace illustration under CTAs */}
      <section id="product" className="px-6 pb-10 md:pb-14">
        <div className="mx-auto max-w-[920px]">
          <HeroWorkspace covers={heroCovers.slice(0, 3)} reduce={!!reduce} />
        </div>
      </section>

      {/* Cover shelf */}
      <section className="overflow-hidden pb-16 pt-6 md:pb-24">
        <div className="mx-auto max-w-[1080px] px-6">
          <h2 className="landing-heading !text-[2rem] sm:!text-[2.5rem]">
            Fresh from the press
          </h2>
        </div>
        <div className="mt-10 flex gap-4 overflow-x-auto px-6 pb-4 scrollbar-none sm:justify-center sm:overflow-visible sm:px-6">
          {shelfCovers.map((book, i) => (
            <motion.div
              key={book.id}
              className="w-[140px] shrink-0 sm:w-[160px]"
              initial={reduce ? false : { opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{
                duration: 0.55,
                delay: i * 0.05,
                ease: [0.22, 1, 0.36, 1],
              }}
              whileHover={reduce ? undefined : { y: -10 }}
            >
              {book.slug && !book.isSample ? (
                <Link href={`/books/${book.slug}`} className="block">
                  <BookCoverCard
                    book={book}
                    index={i}
                    variant="book"
                    className="aspect-[3/4] w-full"
                  />
                </Link>
              ) : (
                <BookCoverCard
                  book={book}
                  index={i}
                  variant="book"
                  className="aspect-[3/4] w-full"
                />
              )}
            </motion.div>
          ))}
        </div>
      </section>
    </>
  );
}

function HeroWorkspace({
  covers,
  reduce,
}: {
  covers: LandingCoverBook[];
  reduce: boolean;
}) {
  const bars = [8, 16, 26, 14, 30, 12, 22, 10, 24, 18, 20, 9, 15];
  const coverA =
    covers[0] ?? {
      id: "a",
      title: "Sample",
      genre: null,
      coverImage: null,
    };
  const coverB =
    covers[1] ?? covers[0] ?? {
      id: "b",
      title: "Sample",
      genre: null,
      coverImage: null,
    };

  return (
    <motion.div
      className="relative overflow-hidden rounded-[28px] border border-[#e8e8e6] bg-[#fafaf8] shadow-[0_20px_60px_rgba(10,37,64,0.08)]"
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.55 }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 40% 60% at 0% 50%, rgba(99,155,255,0.12), transparent 70%), radial-gradient(ellipse 40% 60% at 100% 50%, rgba(120,170,255,0.1), transparent 70%)",
        }}
      />

      <div className="relative grid gap-0 md:grid-cols-[1.1fr_0.9fr]">
        {/* Open manuscript */}
        <div className="relative min-h-[220px] p-5 sm:p-7 md:min-h-[280px]">
          <div className="absolute left-5 top-5 rounded-full bg-[#111] px-2.5 py-1 font-mono text-[10px] text-white sm:left-7 sm:top-7">
            Writing live
          </div>
          <div className="mt-8 flex h-[160px] items-stretch gap-0 sm:mt-10 sm:h-[190px] md:h-[210px]">
            <div className="w-1/2 -rotate-1 rounded-l-md border border-r-0 border-[#e8e8e6] bg-white p-3 shadow-[8px_12px_30px_rgba(0,0,0,0.06)] sm:p-4">
              <p className="font-mono text-[10px] text-[#9a9a9a]">Ch. 12</p>
              <div className="mt-3 space-y-1.5">
                <div className="h-1.5 w-14 rounded bg-[#111]/15" />
                <div className="h-1 w-full rounded bg-[#111]/8" />
                <div className="h-1 w-[94%] rounded bg-[#111]/8" />
                <div className="h-1 w-[88%] rounded bg-[#111]/8" />
                <div className="h-1 w-full rounded bg-[#111]/8" />
                <div className="h-1 w-[70%] rounded bg-[#111]/8" />
              </div>
            </div>
            <div className="relative w-1/2 rotate-1 rounded-r-md border border-[#e8e8e6] bg-[#fffdf8] p-3 shadow-[8px_12px_30px_rgba(0,0,0,0.08)] sm:p-4">
              <p className="font-mono text-[10px] text-[#f97316]">+ draft</p>
              <div className="mt-3 space-y-1.5">
                <div className="h-1 w-full rounded bg-[#111]/10" />
                <div className="h-1 w-full rounded bg-[#111]/10" />
                <motion.div
                  className="h-1 origin-left rounded bg-[#0e6245]/35"
                  animate={reduce ? undefined : { width: ["30%", "100%", "55%"] }}
                  transition={{ duration: 2.8, repeat: Infinity }}
                />
                <div className="h-1 w-[80%] rounded bg-[#111]/8" />
              </div>
              <span className="absolute bottom-3 right-3 h-2 w-2 animate-pulse rounded-full bg-[#22c55e]" />
            </div>
          </div>
        </div>

        {/* Cover + audio side */}
        <div className="relative flex min-h-[220px] items-center justify-center gap-4 border-t border-[#e8e8e6] bg-[#0a2540] p-6 md:min-h-[280px] md:border-l md:border-t-0">
          <div className="relative w-[88px] shrink-0 -rotate-6 sm:w-[104px]">
            <BookCoverCard
              book={coverA}
              index={0}
              variant="art"
              className="aspect-[3/4] w-full shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
            />
          </div>
          <div className="relative w-[100px] shrink-0 rotate-5 sm:w-[118px]">
            <BookCoverCard
              book={coverB}
              index={1}
              variant="art"
              className="aspect-[3/4] w-full shadow-[0_20px_48px_rgba(0,0,0,0.4)]"
            />
          </div>
          <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-3 rounded-2xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
            <div className="flex items-end gap-1">
              {bars.map((h, i) => (
                <motion.span
                  key={i}
                  className="w-1 rounded-full bg-white/80"
                  style={{ height: h }}
                  animate={
                    reduce ? undefined : { height: [h, h + 8, Math.max(6, h - 4), h] }
                  }
                  transition={{
                    duration: 1 + (i % 5) * 0.12,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: i * 0.04,
                  }}
                />
              ))}
            </div>
            <span className="shrink-0 text-[10px] font-medium tracking-wide text-white/85">
              Audiobook · Ch. 4
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

