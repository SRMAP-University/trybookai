"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Mode = "completed" | "failed" | "manual";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: string;
  bookTitle: string;
  mode: Mode;
};

const COMPLETED_OPTIONS = [
  { sentiment: "happy" as const, rating: 5, label: "Loved it", hint: "Smooth & useful" },
  { sentiment: "ok" as const, rating: 3, label: "Okay", hint: "Fine, some issues" },
  { sentiment: "disappointed" as const, rating: 1, label: "Disappointed", hint: "Missed expectations" },
];

const FAILED_OPTIONS = [
  { sentiment: "disappointed" as const, rating: 1, label: "Frustrating", hint: "Blocked me" },
  { sentiment: "ok" as const, rating: 2, label: "Annoying", hint: "Wasted time" },
  { sentiment: "complaint" as const, rating: 1, label: "Broken", hint: "Needs a fix" },
];

export function GenerationReviewDialog({
  open,
  onOpenChange,
  bookId,
  bookTitle,
  mode,
}: Props) {
  const [sentiment, setSentiment] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const options = mode === "failed" ? FAILED_OPTIONS : COMPLETED_OPTIONS;
  const isManual = mode === "manual";

  async function submit() {
    if (!sentiment && !isManual) {
      toast.error("Pick how it went");
      return;
    }
    if (isManual && !comment.trim()) {
      toast.error("Please describe the issue");
      return;
    }
    if (sentiment === "complaint" && !comment.trim()) {
      toast.error("Please describe what went wrong");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/books/${bookId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sentiment: isManual ? "complaint" : sentiment,
          rating: isManual ? null : rating,
          trigger: mode === "manual" ? "manual" : mode,
          comment: comment.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not send feedback");
        return;
      }
      toast.success(
        isManual || sentiment === "complaint"
          ? "Thanks — we’ll look into it"
          : "Thanks for the review"
      );
      onOpenChange(false);
      setSentiment(null);
      setRating(null);
      setComment("");
    } finally {
      setSaving(false);
    }
  }

  function dismiss() {
    try {
      sessionStorage.setItem(`bookai_review_dismissed_${bookId}_${mode}`, "1");
    } catch {
      /* ignore */
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : dismiss())}>
      <DialogContent className="max-w-[420px] gap-0 p-0 sm:rounded-2xl">
        <div className="px-5 pb-2 pt-5">
          <DialogTitle className="text-[18px] font-semibold tracking-[-0.02em] text-[#0a2540]">
            {mode === "failed"
              ? "Generation failed — how bad was it?"
              : mode === "manual"
                ? "Report an issue"
                : "How was this generation?"}
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-[13px] text-[#697386]">
            {mode === "manual"
              ? `Tell us what’s wrong with “${bookTitle}”.`
              : `Quick feedback on “${bookTitle}” helps us improve BookAI.`}
          </DialogDescription>
        </div>

        {!isManual && (
          <div className="grid grid-cols-3 gap-2 px-5 py-3">
            {options.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  setSentiment(opt.sentiment);
                  setRating(opt.rating);
                }}
                className={cn(
                  "rounded-xl border px-2 py-3 text-center transition-colors",
                  sentiment === opt.sentiment
                    ? "border-[#635bff] bg-[#f0efff]"
                    : "border-[#e6ebf1] bg-white hover:bg-[#f6f9fc]"
                )}
              >
                <p className="text-[13px] font-medium text-[#0a2540]">
                  {opt.label}
                </p>
                <p className="mt-0.5 text-[11px] text-[#697386]">{opt.hint}</p>
              </button>
            ))}
          </div>
        )}

        <div className="px-5 pb-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              mode === "failed" || isManual
                ? "What went wrong? (error, stuck progress, quality…)"
                : "Optional — what should we improve?"
            }
            className="min-h-[88px] resize-none text-[13px]"
            maxLength={4000}
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#e6ebf1] px-5 py-3">
          <Button variant="ghost" size="sm" onClick={dismiss} disabled={saving}>
            Not now
          </Button>
          <Button
            size="sm"
            className="bg-[#0a2540] hover:bg-[#143556]"
            onClick={() => void submit()}
            disabled={saving}
          >
            {saving ? "Sending…" : "Send feedback"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function wasReviewDismissed(bookId: string, mode: Mode): boolean {
  try {
    return sessionStorage.getItem(`bookai_review_dismissed_${bookId}_${mode}`) === "1";
  } catch {
    return false;
  }
}
