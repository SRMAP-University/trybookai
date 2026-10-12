import { serifDisplay } from "@/components/marketing/home/fonts";
import { cn } from "@/lib/utils";

/** Deep cover colour per genre, so the preview reads like a real spine. */
const GENRE_COLORS: Record<string, string> = {
  Fiction: "#4c3d99",
  "Non-Fiction": "#0a2540",
  "Self-Help": "#0e6245",
  Business: "#1a3a5c",
  "Science Fiction": "#0f4c5c",
  Fantasy: "#5b2a86",
  Romance: "#9d2b4f",
  Thriller: "#1f2433",
  Mystery: "#2d3a4a",
  Horror: "#4a1418",
  Biography: "#6b4e16",
  Memoir: "#7a4a2a",
  History: "#5a4632",
  Technology: "#133b6b",
  Education: "#1d5c4d",
  "Health & Wellness": "#2f6b4f",
  Philosophy: "#3b3355",
  Poetry: "#6a2c5f",
  "Young Adult": "#b4452f",
  "Children's": "#c2620a",
};

export function genreColor(genre: string) {
  return GENRE_COLORS[genre] ?? "#635bff";
}

export function BookPreviewCover({
  title,
  genre,
  author,
  className,
}: {
  title: string;
  genre: string;
  author?: string | null;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "@container relative aspect-[3/4] overflow-hidden rounded-[3px_8px_8px_3px] text-white shadow-[0_1px_2px_rgba(10,37,64,0.15),0_22px_40px_-18px_rgba(10,37,64,0.55)] transition-[background-color] duration-500",
        className
      )}
      style={{ backgroundColor: genreColor(genre) }}
    >
      {/* Light falloff and spine shading */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.28),transparent_55%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.3)_0%,rgba(255,255,255,0.14)_2%,rgba(0,0,0,0.08)_4.5%,transparent_9%)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/35 to-transparent" />

      <div className="relative flex h-full flex-col p-[11%] pl-[14%]">
        <p className="text-[6.5cqw] font-medium uppercase tracking-[0.2em] text-white/70">
          {genre}
        </p>
        <p
          key={title ? "titled" : "untitled"}
          className={cn(
            serifDisplay.className,
            "mt-auto line-clamp-4 text-[14cqw] leading-[1.02] break-words",
            !title && "text-white/45"
          )}
        >
          {title || "Untitled book"}
        </p>
        <div className="mt-[7cqw] h-px w-1/3 bg-white/45" />
        <p className="mt-[5cqw] truncate text-[6.5cqw] text-white/75">
          {author ? `by ${author}` : "by you"}
        </p>
      </div>
    </div>
  );
}

export function PreviewStats({
  rows,
}: {
  rows: { label: string; value: string }[];
}) {
  return (
    <dl className="divide-y divide-[#eef1f5]">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-3 py-2 text-[13px]"
        >
          <dt className="text-[#697386]">{row.label}</dt>
          <dd className="truncate text-right font-medium text-[#0a2540]">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
