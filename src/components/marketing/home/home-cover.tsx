import type { LandingCoverBook } from "@/lib/landing-covers";
import { SAMPLE_BOOKS } from "@/lib/sample-books";
import { cn } from "@/lib/utils";

/**
 * A book cover styled as a physical book. Real covers render the image;
 * sample books (no cover yet) get a typographic cover in the sample's accent.
 */
export function HomeCover({
  book,
  index = 0,
  priority = false,
  decorative = false,
  className,
}: {
  book: LandingCoverBook;
  index?: number;
  priority?: boolean;
  /** Hide from assistive tech when the same cover is labelled elsewhere. */
  decorative?: boolean;
  className?: string;
}) {
  if (book.coverImage) {
    return (
      <div className={cn("home-cover", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={book.coverImage}
          alt={decorative ? "" : `${book.title} cover`}
          className="h-full w-full object-contain"
          width={384}
          height={512}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "low"}
          decoding="async"
        />
      </div>
    );
  }

  const sample =
    SAMPLE_BOOKS.find((s) => s.id === book.id) ??
    SAMPLE_BOOKS[index % SAMPLE_BOOKS.length];

  return (
    <div
      className={cn(
        "home-cover @container flex flex-col justify-between p-[10%] text-white",
        className
      )}
      style={{ background: sample.accent }}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : `${book.title} cover`}
      aria-hidden={decorative || undefined}
    >
      <p className="text-[7cqw] font-medium uppercase tracking-[0.18em] text-white/70">
        {book.genre ?? sample.genre}
      </p>
      <div>
        <p className="home-serif text-[15cqw] leading-[1.02]">{book.title}</p>
        <div className="mt-[8cqw] h-px w-1/3 bg-white/45" />
      </div>
    </div>
  );
}
