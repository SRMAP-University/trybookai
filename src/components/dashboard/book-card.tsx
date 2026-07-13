import Link from "next/link";
import { Globe, Lock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { BookCover } from "@/components/dashboard/book-cover";
import { cn } from "@/lib/utils";

const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
  DRAFT: { label: "Draft", className: "bg-[#f6f9fc] text-[#697386]" },
  OUTLINING: { label: "Outlining", className: "bg-[#f0efff] text-[#635bff]" },
  GENERATING: {
    label: "Generating",
    className: "bg-[#fcf5e0] text-[#9a6700]",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-[#cbf4c9] text-[#0e6245]",
  },
  FAILED: { label: "Failed", className: "bg-[#fde8e8] text-[#df1b41]" },
  PAUSED: { label: "Paused", className: "bg-[#f6f9fc] text-[#697386]" },
};

export type DashboardBook = {
  id: string;
  title: string;
  slug: string | null;
  genre: string | null;
  coverImage: string | null;
  status: string;
  progress: number;
  currentPages: number;
  targetPages: number;
  isPublic: boolean;
  _count: { chapters: number };
};

type DashboardBookCardProps = {
  book: DashboardBook;
};

export function DashboardBookCard({ book }: DashboardBookCardProps) {
  const status = statusConfig[book.status] ?? statusConfig.DRAFT;
  const isActive =
    book.status === "GENERATING" || book.status === "OUTLINING";
  const coverGenerating =
    !book.coverImage &&
    (book.status === "GENERATING" || book.status === "OUTLINING");

  return (
    <Link
      href={`/dashboard/books/${book.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-[#e6ebf1] bg-white transition-all hover:border-[#635bff]/35 hover:shadow-[0_8px_30px_rgba(99,91,255,0.08)]"
    >
      {/* Cover */}
      <div className="relative flex items-end justify-center bg-linear-to-b from-[#f6f9fc] to-[#eef2f7] px-5 pb-5 pt-6">
        <div className="relative w-full max-w-[148px]">
          <div
            aria-hidden
            className="absolute -bottom-2 left-1/2 h-3 w-[88%] -translate-x-1/2 rounded-[50%] bg-black/10 blur-md transition-opacity group-hover:opacity-80"
          />
          <BookCover
            title={book.title}
            coverImage={book.coverImage}
            generating={coverGenerating}
            aspect="card"
            className="relative w-full shadow-[0_12px_28px_rgba(10,37,64,0.18)] ring-1 ring-black/5 transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_16px_36px_rgba(10,37,64,0.22)]"
          />
          <span
            className={cn(
              "absolute -right-1 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium shadow-sm",
              status.className
            )}
          >
            {status.label}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col gap-3 border-t border-[#e6ebf1] p-4">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug text-[#0a2540] group-hover:text-[#635bff]">
            {book.title}
          </h3>
          <p className="mt-1.5 text-[12px] text-[#697386]">
            {book.genre ?? "General"}
            <span className="mx-1.5 text-[#d8dee6]">·</span>
            {book._count.chapters} chapter
            {book._count.chapters === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] text-[#697386]">
          <span className="inline-flex items-center gap-1">
            {book.isPublic ? (
              <>
                <Globe className="h-3 w-3" />
                Public
              </>
            ) : (
              <>
                <Lock className="h-3 w-3" />
                Private
              </>
            )}
          </span>
          <span>
            {book.currentPages}/{book.targetPages} pg
          </span>
        </div>

        {isActive ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-[#697386]">
              <span>Progress</span>
              <span className="font-medium text-[#0a2540]">
                {Math.round(book.progress)}%
              </span>
            </div>
            <Progress value={book.progress} className="h-1.5" />
          </div>
        ) : book.status === "COMPLETED" ? (
          <p className="text-[11px] font-medium text-[#0e6245]">
            Ready to read or export
          </p>
        ) : null}
      </div>
    </Link>
  );
}
