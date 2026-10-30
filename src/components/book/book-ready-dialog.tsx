"use client";

import Link from "next/link";
import { BookOpen, Headphones, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: string;
  title: string;
  coverImage: string | null;
  chapters: number;
  pages: number;
  onCreateAudio: () => void;
  /** Public page path, when the book is public, to offer sharing */
  sharePath?: string | null;
};

/** Shown the moment a book finishes writing: the cover, and an invitation to open it. */
export function BookReadyDialog({
  open,
  onOpenChange,
  bookId,
  title,
  coverImage,
  chapters,
  pages,
  onCreateAudio,
  sharePath,
}: Props) {
  async function share() {
    if (!sharePath) return;
    const url = `${window.location.origin}${sharePath}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `Read “${title}” on BookAI`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      toast.error("Couldn't share the link.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] overflow-hidden rounded-3xl border-0 bg-[#0d1524] p-0 text-white">
        <div className="relative isolate px-6 pb-6 pt-9 text-center">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_20%,#2d3b57_0%,#0d1524_70%)]" />
          <div className="book-rise mx-auto w-[148px]">
            <div className="book-float relative aspect-[2/3] overflow-hidden rounded-[3px_8px_8px_3px] bg-linear-to-br from-[#1c2d4d] to-[#0a1428] shadow-[0_2px_6px_rgba(0,0,0,0.35),0_34px_60px_-24px_rgba(0,0,0,0.9)] ring-1 ring-white/10">
              {coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="absolute inset-x-3 bottom-4 text-left font-serif text-[18px] leading-tight">
                  {title}
                </span>
              )}
              <span className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.18),transparent_4%,rgba(0,0,0,0.3)_5%,transparent_12%)]" />
            </div>
          </div>
          <DialogTitle className="mt-6 text-[22px] font-semibold tracking-[-0.02em] text-white">
            Your book is ready
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-[13.5px] text-white/65">
            {title} · {chapters} {chapters === 1 ? "chapter" : "chapters"}
            {pages > 0 ? ` · ${pages} pages` : ""}
          </DialogDescription>
          <div className="mt-6 grid gap-2">
            <Button asChild className="h-11 rounded-full bg-[#635bff] text-[14px] hover:bg-[#5851e5]">
              <Link href={`/dashboard/books/${bookId}/read?fresh=1`}>
                <BookOpen className="h-4 w-4" />
                Open the book
              </Link>
            </Button>
            <Button
              variant="ghost"
              className="h-10 rounded-full text-[13.5px] text-white/80 hover:bg-white/10 hover:text-white"
              onClick={() => {
                onOpenChange(false);
                onCreateAudio();
              }}
            >
              <Headphones className="h-4 w-4" />
              Make an audiobook
            </Button>
            {sharePath && (
              <Button
                variant="ghost"
                className="h-10 rounded-full text-[13.5px] text-white/80 hover:bg-white/10 hover:text-white"
                onClick={() => void share()}
              >
                <Share2 className="h-4 w-4" />
                Share it
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
