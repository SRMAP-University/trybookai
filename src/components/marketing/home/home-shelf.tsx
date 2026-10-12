import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LandingCoverBook } from "@/lib/landing-covers";
import { HomeCover } from "@/components/marketing/home/home-cover";
import { InView } from "@/components/marketing/home/in-view";

/** Copies of the cover set in the marquee track; must be even (loops at -50%). */
const COPIES = 4;

export function HomeShelf({ covers }: { covers: LandingCoverBook[] }) {
  const track = Array.from({ length: COPIES }, () => covers).flat();

  return (
    <section className="pb-24 md:pb-32">
      <InView className="mx-auto flex max-w-[1200px] items-end justify-between gap-6 px-6">
        <h2 className="rv home-serif text-[34px] leading-none text-[#0a2540] sm:text-[48px]">
          Fresh from the press
        </h2>
        <Link
          href="/books"
          className="rv group inline-flex shrink-0 items-center gap-1.5 text-[14px] font-medium text-[#0a2540]"
          style={{ "--i": 1 } as CSSProperties}
        >
          <span className="hidden sm:inline">Browse the library</span>
          <span className="sm:hidden">Library</span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </InView>

      <div className="home-marquee mt-10 overflow-hidden py-6">
        <ul className="home-marquee-track flex w-max">
          {track.map((book, i) => {
            const copy = i >= covers.length;
            const href =
              book.slug && !book.isSample ? `/books/${book.slug}` : null;
            const cover = (
              <HomeCover
                book={book}
                index={i % covers.length}
                decorative={copy}
                className="w-full transition-transform duration-300 ease-out group-hover:-translate-y-2 group-hover:rotate-[-1.5deg]"
              />
            );

            return (
              <li
                key={`${book.id}-${i}`}
                aria-hidden={copy || undefined}
                className="mr-5 w-[150px] shrink-0 sm:mr-7 sm:w-[190px]"
              >
                {href ? (
                  <Link
                    href={href}
                    tabIndex={copy ? -1 : undefined}
                    className="group block"
                  >
                    {cover}
                  </Link>
                ) : (
                  <div className="group">{cover}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
