"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { readJson } from "@/lib/api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: string;
  title: string;
  isPublic: boolean;
};

/** Confirm, then delete a book with everything made from it. */
export function DeleteBookDialog({ open, onOpenChange, bookId, title, isPublic }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/books/${bookId}`, { method: "DELETE" });
      const json = await readJson<{ success: boolean }>(res);
      if (!json.ok) {
        toast.error(json.error);
        return;
      }
      toast.success(`Deleted “${title}”`);
      onOpenChange(false);
      router.push("/dashboard/books");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !deleting && onOpenChange(next)}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Delete this book?</DialogTitle>
          <DialogDescription>
            “{title}” will be deleted for good, with its chapters, pictures, audio and reels.
            {isPublic ? " Its public page will stop working." : ""} This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" disabled={deleting} onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button
            className="bg-[#df1b41] text-white hover:bg-[#c0123a]"
            disabled={deleting}
            onClick={() => void remove()}
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
