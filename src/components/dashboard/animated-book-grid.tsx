"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  DashboardBookCard,
  type DashboardBook,
} from "@/components/dashboard/book-card";
import { BookCover } from "@/components/dashboard/book-cover";
import { Progress } from "@/components/ui/progress";
import { SAMPLE_BOOKS } from "@/lib/sample-books";

const list = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
};

const item = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 380, damping: 28 },
  },
};

type CoverBook = {
  id: string;
  title: string;
  slug?: string | null;
  genre: string | null;
  coverImage: string | null;
  isSample?: boolean;
};

type GeneratingBook = {
  id: string;
  title: string;
  status: string;
  progress: number;
  currentPages: number;
  targetPages: number;
};

export function AnimatedCoverGrid({ covers }: { covers: CoverBook[] }) {
  return (
    <motion.div
      className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4"
      variants={list}
      initial="hidden"
      animate="show"
    >
      {covers.map((book, i) => {
        const sample = SAMPLE_BOOKS[i % SAMPLE_BOOKS.length];
        const href = book.slug
          ? `/books/${book.slug}`
          : book.isSample
            ? `/dashboard/books/new?template=${sample.templateId}&title=${encodeURIComponent(book.title)}`
            : `/dashboard/books/new?title=${encodeURIComponent(book.title)}`;

        return (
          <motion.div key={book.id} variants={item} className="h-full">
            <Link
              href={href}
              className="group block h-full"
            >
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
              >
                <BookCover
                  title={book.title}
                  coverImage={book.coverImage}
                  aspect="card"
                  className="rounded-xl shadow-[0_8px_22px_-10px_rgba(10,37,64,0.35)] transition-shadow duration-300 group-hover:shadow-[0_16px_32px_-12px_rgba(10,37,64,0.4)]"
                />
              </motion.div>
              <div className="px-0.5 pt-2.5">
                <p className="line-clamp-1 text-[13px] font-medium text-[#0a2540] transition-colors group-hover:text-[#635bff]">
                  {book.title}
                </p>
                <p className="mt-0.5 text-[11px] text-[#697386]">
                  {book.genre ?? "Book"}
                  {book.isSample ? " · Sample" : ""}
                </p>
              </div>
            </Link>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

export function AnimatedGeneratingList({ books }: { books: GeneratingBook[] }) {
  const [live, setLive] = useState(books);
  const bookIds = books.map((b) => b.id).join("|");

  useEffect(() => {
    setLive(books);
  }, [books]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/jobs/active", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          books?: Array<{
            id: string;
            title: string;
            status: string;
            progress: number;
            currentPages: number;
            targetPages: number;
          }>;
        };
        const byId = new Map((data.books ?? []).map((b) => [b.id, b]));
        setLive((prev) =>
          prev.map((book) => {
            const next = byId.get(book.id);
            if (!next) return book;
            return {
              ...book,
              status: next.status,
              progress: next.progress,
              currentPages: next.currentPages,
              targetPages: next.targetPages,
            };
          })
        );
      } catch {
        // ignore transient poll errors
      }
    }

    void poll();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [bookIds]);

  return (
    <motion.div
      className="grid gap-1.5 sm:grid-cols-2"
      variants={list}
      initial="hidden"
      animate="show"
    >
      {live.map((book) => (
        <motion.div key={book.id} variants={item}>
          <Link
            href={`/dashboard/books/${book.id}`}
            className="block overflow-hidden rounded-xl bg-[#f6f9fc] px-3 py-2.5 transition-colors hover:bg-[#f0efff]"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium leading-tight text-[#0a2540]">
                  {book.title}
                </p>
                <p className="mt-0.5 text-[10px] capitalize leading-tight text-[#697386]">
                  {book.status.toLowerCase()} · {book.currentPages}/
                  {book.targetPages} pages
                </p>
              </div>
              <motion.span
                className="shrink-0 text-[11px] font-medium tabular-nums text-[#635bff]"
                animate={{ opacity: [1, 0.45, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                {Math.round(book.progress)}%
              </motion.span>
            </div>
            <Progress value={book.progress} className="mt-1.5 h-1" />
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}

/** Cards past this index appear with the last row instead of queueing up. */
const MAX_STAGGERED = 8;

const bookItem = {
  hidden: item.hidden,
  show: (index: number) => ({
    ...item.show,
    transition: {
      ...item.show.transition,
      delay: 0.04 + Math.min(index, MAX_STAGGERED) * 0.07,
    },
  }),
};

export function AnimatedBookGrid({ books }: { books: DashboardBook[] }) {
  return (
    <motion.div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      initial="hidden"
      animate="show"
    >
      {books.map((book, index) => (
        <motion.div
          key={book.id}
          variants={bookItem}
          custom={index}
          className="h-full"
        >
          <DashboardBookCard book={book} />
        </motion.div>
      ))}
    </motion.div>
  );
}
