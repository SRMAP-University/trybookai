import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Globe,
  Headphones,
  Library,
  PenLine,
  Smartphone,
} from "lucide-react";
import { InView } from "@/components/marketing/home/in-view";

const FEATURES = [
  { icon: BookOpen, label: "Full-length books" },
  { icon: PenLine, label: "Chapter editor" },
  { icon: Library, label: "Fiction & nonfiction" },
  { icon: Headphones, label: "AI narration" },
  { icon: Globe, label: "Public book pages" },
  { icon: Smartphone, label: "Android app" },
] as const;

const delay = (i: number) => ({ "--i": i }) as CSSProperties;

export function HomeFeatures() {
  return (
    <section className="border-y border-[#e6ebf1] bg-[#f6f9fc] py-24 md:py-28">
      <InView className="mx-auto max-w-[1200px] px-6">
        <div className="flex items-end justify-between gap-6">
          <h2 className="rv home-serif text-[40px] leading-[1.02] text-[#0a2540] sm:text-[52px]">
            Everything a book needs.
          </h2>
          <Link
            href="/features"
            className="rv group hidden shrink-0 items-center gap-1.5 text-[14px] font-medium text-[#0a2540] sm:inline-flex"
            style={delay(1)}
          >
            All features
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <ul className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
          {FEATURES.map(({ icon: Icon, label }, i) => (
            <li
              key={label}
              className="rv group flex flex-col gap-8 rounded-2xl border border-[#e6ebf1] bg-white p-5 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:border-[#c9c5ff] hover:shadow-[0_18px_36px_-22px_rgba(99,91,255,0.45)]"
              style={delay(1 + i)}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f0efff] text-[#635bff] transition-[transform,background-color,color] duration-300 group-hover:rotate-[-8deg] group-hover:scale-110 group-hover:bg-[#635bff] group-hover:text-white">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="text-[15px] font-medium leading-snug text-[#0a2540]">
                {label}
              </span>
            </li>
          ))}
        </ul>
      </InView>
    </section>
  );
}
