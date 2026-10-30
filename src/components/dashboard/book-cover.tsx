import { cn } from "@/lib/utils";
import { ImageIcon, Loader2 } from "lucide-react";

type BookCoverProps = {
  title: string;
  coverImage: string | null;
  generating?: boolean;
  className?: string;
  aspect?: "card" | "detail" | "compact";
};

export function BookCover({
  title,
  coverImage,
  generating = false,
  className,
  aspect = "card",
}: BookCoverProps) {
  const aspectClass =
    aspect === "detail"
      ? "aspect-[3/4] max-w-[220px]"
      : aspect === "compact"
        ? "aspect-[3/4] w-[88px] shrink-0"
        : "aspect-[3/4] w-full";

  if (coverImage) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-lg bg-[#f6f9fc] shadow-sm",
          aspectClass,
          className
        )}
      >
        {/* Covers that aren't 3:4 sit on a blurred copy of themselves
            instead of grey bars. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverImage}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-xl"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverImage}
          alt={`${title} cover`}
          className="relative h-full w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg bg-linear-to-br from-[#f0efff] to-[#f6f9fc] text-center",
        aspectClass,
        className
      )}
    >
      {generating ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin text-[#635bff]" />
          {aspect === "detail" && (
            <p className="mt-2 px-3 text-[11px] text-[#697386]">
              Generating cover with Flux…
            </p>
          )}
        </>
      ) : (
        <>
          <ImageIcon className="h-5 w-5 text-[#a3acb9]" />
          {aspect === "detail" && (
            <p className="mt-2 px-3 text-[11px] text-[#697386]">No cover yet</p>
          )}
        </>
      )}
    </div>
  );
}
