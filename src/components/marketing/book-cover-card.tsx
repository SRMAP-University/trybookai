import type { LandingCoverBook } from "@/lib/landing-covers";
import { SAMPLE_BOOKS } from "@/lib/sample-books";

const COVER_ART: Record<
  string,
  {
    gradient: string;
    shape: string;
    tag: string;
    bubble: string;
  }
> = {
  "sample-silent-archive": {
    gradient: "linear-gradient(145deg, #4c3d99 0%, #635bff 45%, #8b7cf8 100%)",
    shape:
      "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.35) 0%, transparent 55%)",
    tag: "@elena",
    bubble: "bg-[#4a7cf7]",
  },
  "sample-operator-playbook": {
    gradient: "linear-gradient(145deg, #0a2540 0%, #1a3a5c 50%, #2d5a87 100%)",
    shape:
      "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.15) 40%, rgba(255,255,255,0.15) 60%, transparent 60%)",
    tag: "@ops",
    bubble: "bg-[#111]",
  },
  "sample-second-dawn": {
    gradient: "linear-gradient(145deg, #0e6245 0%, #1a8f62 50%, #4ade80 100%)",
    shape:
      "radial-gradient(ellipse at 30% 80%, rgba(255,255,255,0.3) 0%, transparent 50%)",
    tag: "@dawn",
    bubble: "bg-[#22c55e]",
  },
  "sample-night-circuit": {
    gradient: "linear-gradient(145deg, #1a1200 0%, #9a6700 40%, #fbbf24 100%)",
    shape:
      "radial-gradient(circle at 50% 20%, rgba(255,255,255,0.2) 0%, transparent 40%)",
    tag: "@night",
    bubble: "bg-[#ef4444]",
  },
};

const BUBBLE_COLORS = [
  "bg-[#4a7cf7]",
  "bg-[#111]",
  "bg-[#22c55e]",
  "bg-[#ef4444]",
];

function sampleFallback(index: number): (typeof SAMPLE_BOOKS)[number] {
  return SAMPLE_BOOKS[index % SAMPLE_BOOKS.length];
}

export function BookCoverCard({
  book,
  className = "",
  variant = "art",
  index = 0,
}: {
  book: LandingCoverBook;
  className?: string;
  variant?: "art" | "book";
  index?: number;
}) {
  const art = COVER_ART[book.id] ?? {
    gradient: `linear-gradient(145deg, ${["#4c3d99", "#0a2540", "#0e6245", "#9a6700"][index % 4]} 0%, #635bff 100%)`,
    shape:
      "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.25) 0%, transparent 55%)",
    tag: book.genre ? `@${book.genre.toLowerCase().slice(0, 8)}` : "@book",
    bubble: BUBBLE_COLORS[index % BUBBLE_COLORS.length],
  };

  if (book.coverImage) {
    return (
      <div
        className={`relative overflow-hidden rounded-[16px] bg-[#111] shadow-[0_12px_40px_rgba(0,0,0,0.14)] ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={book.coverImage}
          alt={`${book.title} cover`}
          className="h-full w-full object-cover"
        />
        {variant === "book" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-4 pt-10">
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/70">
              {book.genre ?? "Book"}
            </p>
            <p className="mt-1 line-clamp-2 text-[15px] font-bold leading-tight text-white">
              {book.title}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Sample / placeholder art
  const sample = sampleFallback(index);
  const sampleArt = COVER_ART[sample.id] ?? art;

  return (
    <div
      className={`relative overflow-hidden rounded-[16px] shadow-[0_12px_40px_rgba(0,0,0,0.14)] ${className}`}
      style={{ background: sampleArt.gradient }}
    >
      <div className="absolute inset-0" style={{ background: sampleArt.shape }} />
      {variant === "book" && (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/70">
              {book.genre ?? sample.genre}
            </p>
            <p className="mt-1 text-[15px] font-bold leading-tight text-white">
              {book.title || sample.title}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export function CoverBubble({
  book,
  index = 0,
  className = "",
}: {
  book: LandingCoverBook;
  index?: number;
  className?: string;
}) {
  const art = COVER_ART[book.id];
  const label = art?.tag
    ?? (book.genre
      ? `@${book.genre.toLowerCase().replace(/\s+/g, "").slice(0, 10)}`
      : "@bookai");
  const color = art?.bubble ?? BUBBLE_COLORS[index % BUBBLE_COLORS.length];

  return (
    <span
      className={`inline-flex rounded-full px-3.5 py-1.5 text-[12px] font-medium text-white shadow-[0_4px_14px_rgba(0,0,0,0.12)] ${color} ${className}`}
    >
      {label}
    </span>
  );
}
