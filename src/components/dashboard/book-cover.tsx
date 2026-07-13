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
      ? "aspect-[2/3] max-w-[220px]"
      : aspect === "compact"
        ? "aspect-[2/3] w-[88px] shrink-0"
        : "aspect-[2/3] w-full";

  if (coverImage) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-[#e6ebf1] bg-[#f6f9fc] shadow-sm",
          aspectClass,
          className
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverImage}
          alt={`${title} cover`}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-[#e6ebf1] bg-linear-to-br from-[#f0efff] to-[#f6f9fc] text-center",
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
