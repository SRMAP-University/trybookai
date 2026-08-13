"use client";

import Link from "next/link";
import { Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GenerationSpeed } from "@/lib/ai-models";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (speed: GenerationSpeed) => void;
  busy?: boolean;
  resume?: boolean;
  /** When false, Super Fast is locked behind upgrade. */
  canUseSuperFast?: boolean;
};

export function GenerationSpeedDialog({
  open,
  onOpenChange,
  onChoose,
  busy,
  resume,
  canUseSuperFast = false,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="space-y-1 border-b border-[#eef1f5] px-5 py-4 text-left">
          <DialogTitle className="text-[17px] font-semibold tracking-tight text-[#0a2540]">
            {resume ? "Resume generation" : "Generate your book"}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-[#62748e]">
            Choose how fast to write. You can change this next time you generate.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 p-5">
          <button
            type="button"
            disabled={busy}
            onClick={() => onChoose("normal")}
            className="rounded-lg border border-[#e6ebf1] bg-white px-4 py-3.5 text-left transition hover:border-[#635bff]/40 hover:bg-[#f8f7ff] disabled:opacity-60"
          >
            <div className="text-[14px] font-semibold text-[#0a2540]">
              Normal
            </div>
            <p className="mt-1 text-[12.5px] leading-snug text-[#62748e]">
              Cloudflare Workers AI — reliable long-form writing at standard
              speed.
            </p>
          </button>

          {canUseSuperFast ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onChoose("super_fast")}
              className="rounded-lg border border-[#635bff]/35 bg-[#f8f7ff] px-4 py-3.5 text-left transition hover:border-[#635bff] hover:bg-[#f1efff] disabled:opacity-60"
            >
              <div className="flex items-center gap-1.5 text-[14px] font-semibold text-[#0a2540]">
                <Zap className="h-3.5 w-3.5 text-[#635bff]" />
                Super Fast
              </div>
              <p className="mt-1 text-[12.5px] leading-snug text-[#62748e]">
                Groq Llama 3.3 — much quicker drafts. Great when you want
                results now.
              </p>
            </button>
          ) : (
            <div className="rounded-lg border border-dashed border-[#e6ebf1] bg-[#fafbfc] px-4 py-3.5">
              <div className="flex items-center gap-1.5 text-[14px] font-semibold text-[#0a2540]">
                <Lock className="h-3.5 w-3.5 text-[#8896a8]" />
                Super Fast
                <span className="ml-1 rounded bg-[#eef1f5] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#62748e]">
                  Pro
                </span>
              </div>
              <p className="mt-1 text-[12.5px] leading-snug text-[#62748e]">
                Groq-powered drafts are included on paid plans.
              </p>
              <Button
                asChild
                variant="outline"
                className="mt-3 h-8 border-[#e6ebf1] text-[12.5px]"
              >
                <Link href="/dashboard/billing">Upgrade to unlock</Link>
              </Button>
            </div>
          )}
        </div>

        <div className="border-t border-[#eef1f5] px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-full text-[13px] text-[#62748e]"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
