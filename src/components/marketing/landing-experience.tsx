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
            className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#111]/55"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            BookAI
          </motion.p>
          <motion.h1
            className="mx-auto mt-4 max-w-[900px] text-[46px] font-bold leading-[1.02] tracking-[-0.045em] text-[#111] sm:text-[64px] md:text-[78px]"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
          >
            From one idea
            <span className="block">to a finished book.</span>
          </motion.h1>

          {/* Floating cover stage — main visual */}
          <div className="landing-book-stage relative mx-auto -mt-1 h-[220px] max-w-[760px] sm:mt-2 sm:h-[260px] md:h-[300px]">
            <div className="absolute inset-x-[8%] bottom-0 h-8 rounded-[100%] bg-[#111]/10 blur-xl" />
            <div className="absolute inset-0 flex items-end justify-center pb-2">
              {heroCovers.map((book, i) => {
                const base = FAN[i].rotate;
                return (
                  <motion.div
                    key={book.id}
                    className="relative w-[92px] shrink-0 sm:w-[112px] md:w-[128px]"
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
            className="relative mx-auto mt-10 w-full max-w-[560px] text-left sm:mt-12"
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

      {/* Illustrated product strip — open book + audio + export, not icon boxes */}
      <section id="product" className="px-6 pb-8 md:pb-10">
        <div className="mx-auto max-w-[1080px]">
          <div className="landing-scene-row">
            <SceneManuscript />
            <SceneCover covers={heroCovers.slice(0, 2)} />
            <SceneAudio />
          </div>
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

function SceneManuscript() {
  return (
    <div className="landing-scene">
      <div className="landing-scene-art landing-scene-art--ink">
        <div className="absolute left-6 top-5 h-[72%] w-[42%] -rotate-3 rounded-sm bg-white shadow-[4px_8px_24px_rgba(0,0,0,0.12)]">
          <div className="space-y-1.5 p-3 pt-4">
            <div className="h-1 w-10 rounded bg-[#111]/20" />
            <div className="h-1 w-full rounded bg-[#111]/10" />
            <div className="h-1 w-[92%] rounded bg-[#111]/10" />
            <div className="h-1 w-[85%] rounded bg-[#111]/10" />
            <div className="h-1 w-full rounded bg-[#111]/10" />
            <div className="h-1 w-[70%] rounded bg-[#111]/10" />
          </div>
        </div>
        <div className="absolute right-5 top-8 h-[68%] w-[44%] rotate-[4deg] rounded-sm bg-[#fffaf3] shadow-[6px_10px_28px_rgba(0,0,0,0.14)]">
          <div className="space-y-1.5 p-3 pt-5">
            <div className="h-1.5 w-12 rounded bg-[#f97316]/50" />
            <div className="h-1 w-full rounded bg-[#111]/12" />
            <div className="h-1 w-full rounded bg-[#111]/12" />
            <div className="h-1 w-[88%] rounded bg-[#111]/12" />
            <div className="mt-3 h-1 w-[60%] rounded bg-[#111]/8" />
          </div>
          <span className="absolute bottom-3 right-3 h-2 w-2 animate-pulse rounded-full bg-[#22c55e]" />
        </div>
      </div>
      <p className="landing-scene-label">Live manuscript</p>
    </div>
  );
}

function SceneCover({ covers }: { covers: LandingCoverBook[] }) {
  return (
    <div className="landing-scene">
      <div className="landing-scene-art landing-scene-art--cover">
        <div className="absolute left-1/2 top-1/2 w-[46%] -translate-x-[70%] -translate-y-1/2 -rotate-8">
          <BookCoverCard
            book={covers[0] ?? { id: "a", title: "A", genre: null, coverImage: null }}
            index={0}
            variant="art"
            className="aspect-[3/4] w-full opacity-80 shadow-lg"
          />
        </div>
        <div className="absolute left-1/2 top-1/2 w-[52%] -translate-x-[20%] -translate-y-1/2 rotate-6">
          <BookCoverCard
            book={covers[1] ?? covers[0] ?? { id: "b", title: "B", genre: null, coverImage: null }}
            index={1}
            variant="art"
            className="aspect-[3/4] w-full shadow-[0_16px_40px_rgba(0,0,0,0.25)]"
          />
        </div>
      </div>
      <p className="landing-scene-label">Generated covers</p>
    </div>
  );
}

function SceneAudio() {
  const bars = [10, 18, 28, 16, 32, 14, 24, 12, 26, 18, 22, 11];
  return (
    <div className="landing-scene">
      <div className="landing-scene-art landing-scene-art--audio">
        <div className="absolute inset-x-8 top-1/2 flex -translate-y-1/2 items-end justify-center gap-1.5">
          {bars.map((h, i) => (
            <motion.span
              key={i}
              className="w-1.5 rounded-full bg-white/85"
              style={{ height: h }}
              animate={{ height: [h, h + 10, h] }}
              transition={{
                duration: 1.1 + (i % 4) * 0.15,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.05,
              }}
            />
          ))}
        </div>
        <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full bg-[#4ade80]" />
          <span className="text-[10px] font-medium tracking-wide text-white/90">
            Narrating Ch. 4
          </span>
        </div>
      </div>
      <p className="landing-scene-label">Audiobook & song</p>
    </div>
  );
}
