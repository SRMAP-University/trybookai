"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Layers, Sparkles, FileDown } from "lucide-react";
import type { LandingCoverBook } from "@/lib/landing-covers";
import {
  BookCoverCard,
  CoverBubble,
} from "@/components/marketing/book-cover-card";

const features = [
  { title: "Outlines", icon: Layers },
  { title: "Generation", icon: Sparkles },
  { title: "Export", icon: FileDown },
];

const FAN = [
  { rotate: -20, y: 24, bubble: true },
  { rotate: -12, y: 12, bubble: false },
  { rotate: -5, y: 2, bubble: true },
  { rotate: 5, y: 2, bubble: false },
  { rotate: 12, y: 12, bubble: true },
  { rotate: 20, y: 24, bubble: false },
] as const;

type LandingExperienceProps = {
  covers: LandingCoverBook[];
};

export function LandingExperience({ covers }: LandingExperienceProps) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const heroCovers = covers.slice(0, 6);
  const gridCovers = covers.slice(6, 10);

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
      <section className="px-6 pb-14 pt-[88px] text-center md:pb-16 md:pt-[104px]">
        <h1 className="mx-auto max-w-[920px] text-[48px] font-bold leading-[1.02] tracking-[-0.04em] text-[#111] sm:text-[64px] md:text-[76px]">
          A place to publish your masterpiece
        </h1>

        <div className="mx-auto mt-8 flex h-[190px] max-w-[700px] items-center justify-center sm:mt-10 sm:h-[215px] md:h-[240px]">
          {heroCovers.map((book, i) => {
            const base = FAN[i].rotate;
            return (
              <motion.div
                key={book.id}
                className="relative w-[86px] shrink-0 sm:w-[102px] md:w-[116px]"
                initial={{
                  marginLeft: i === 0 ? 0 : -28,
                  rotate: base,
                  y: FAN[i].y,
                  zIndex: i + 1,
                }}
                animate={{
                  rotate: [base - 2, base + 2, base - 2],
                }}
                transition={{
                  duration: 4 + i * 0.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{
                  marginLeft: i === 0 ? 0 : -28,
                  zIndex: i + 1,
                }}
              >
                {FAN[i].bubble && (
                  <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-[115%]">
                    <CoverBubble book={book} index={i} />
                  </div>
                )}
                <BookCoverCard
                  book={book}
                  index={i}
                  variant="art"
                  className="aspect-square w-full"
                />
              </motion.div>
            );
          })}
        </div>

        <p className="mx-auto mt-8 max-w-[480px] text-[15px] leading-relaxed text-[#6b6b6b] sm:mt-10 sm:text-[16px]">
          Writers can publish their masterpieces, and readers can discover them
          in one place.
        </p>

        <form
          onSubmit={handlePromptSubmit}
          className="mx-auto mt-8 w-full max-w-[560px] text-left"
        >
          <label htmlFor="hero-prompt" className="sr-only">
            Book idea
          </label>
          <textarea
            id="hero-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Describe your book idea — genre, premise, tone…"
            className="w-full resize-none rounded-[20px] border border-[#e8e8e6] bg-white px-5 py-4 text-[15px] leading-relaxed text-[#111] shadow-[0_8px_30px_rgba(0,0,0,0.04)] outline-none placeholder:text-[#9a9a9a] transition-[border-color,box-shadow] focus:border-[#111] focus:shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
          />
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button type="submit" className="landing-btn-dark">
              Get started
              <ArrowRight className="h-4 w-4" />
            </button>
            <Link href="/books" className="landing-btn-light">
              Read more
            </Link>
          </div>
        </form>
      </section>

      <section id="product" className="px-6 pb-20 md:pb-24">
        <div className="mx-auto max-w-[1080px]">
          <h2 className="landing-heading !text-[2rem] sm:!text-[2.5rem]">
            One workspace. Full book.
          </h2>

          <div className="mx-auto mt-10 grid max-w-[560px] grid-cols-2 gap-4 sm:max-w-[600px] sm:gap-5">
            {gridCovers.map((book, i) => (
              <motion.div
                key={book.id}
                initial={
                  reduce
                    ? false
                    : { opacity: 0, scale: 0.85, y: 48, rotate: FAN[i].rotate }
                }
                whileInView={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{
                  duration: 0.65,
                  delay: i * 0.07,
                  ease: [0.22, 1, 0.36, 1],
                }}
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

          <div className="mx-auto mt-10 grid max-w-[720px] gap-3 sm:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="landing-card flex items-center justify-center gap-3 p-4"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f0f0ee]">
                  <feature.icon className="h-4 w-4 text-[#111]" />
                </div>
                <span className="text-[14px] font-semibold text-[#111]">
                  {feature.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
