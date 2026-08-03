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
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
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
              className="group block h-full overflow-hidden rounded-lg border border-[#e6ebf1] bg-white transition-colors hover:border-[#635bff]/40"
            >
              <motion.div
                className="overflow-hidden"
                whileHover={{ scale: 1.03 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
              >
                <BookCover
                  title={book.title}
                  coverImage={book.coverImage}
                  aspect="card"
                  className="rounded-none border-0 shadow-none ring-0"
                />
              </motion.div>
              <div className="p-3">
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
    }, 4_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [bookIds]);

  return (
    <motion.div
      className="grid gap-3 sm:grid-cols-2"
      variants={list}
      initial="hidden"
      animate="show"
    >
      {live.map((book) => (
        <motion.div key={book.id} variants={item}>
          <Link
            href={`/dashboard/books/${book.id}`}
            className="block overflow-hidden rounded-lg border border-[#e6ebf1] bg-white p-4 transition-colors hover:border-[#635bff]/40"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-medium text-[#0a2540]">
                  {book.title}
                </p>
                <p className="text-[12px] capitalize text-[#697386]">
                  {book.status.toLowerCase()} · {book.currentPages}/
                  {book.targetPages} pages
                </p>
              </div>
              <motion.span
                className="text-[13px] font-medium text-[#635bff]"
                animate={{ opacity: [1, 0.45, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                {Math.round(book.progress)}%
              </motion.span>
            </div>
            <Progress value={book.progress} className="mt-3 h-1.5" />
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}

export function AnimatedBookGrid({ books }: { books: DashboardBook[] }) {
  return (
    <motion.div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      variants={list}
      initial="hidden"
      animate="show"
    >
      {books.map((book) => (
        <motion.div key={book.id} variants={item} className="h-full">
          <DashboardBookCard book={book} />
        </motion.div>
      ))}
    </motion.div>
  );
}
