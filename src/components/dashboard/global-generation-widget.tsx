"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, X } from "lucide-react";
import { ActiveJobsList, useActiveJobs } from "@/components/dashboard/active-jobs";

/**
 * Desktop: a floating card with running jobs in the bottom corner. On phones
 * the header shows progress instead (HeaderJobsIndicator), so this is hidden.
 */
export function GlobalGenerationWidget() {
  const { books, audios, total } = useActiveJobs();
  const [collapsed, setCollapsed] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const visibleKeyRef = useRef("");

  const key = [...books.map((b) => b.id), ...audios.map((a) => a.id)].sort().join("|");

  useEffect(() => {
    if (total > 0 && key !== visibleKeyRef.current) {
      // New jobs bring the card back (collapsed, so it doesn't interrupt).
      visibleKeyRef.current = key;
      void Promise.resolve().then(() => setDismissed(false));
    }
    if (total === 0) visibleKeyRef.current = "";
  }, [total, key]);

  if (total === 0 || dismissed) return null;

  return (
    <div className="fixed bottom-6 right-4 z-40 hidden w-[340px] lg:block">
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex w-full items-center gap-2.5 rounded-full bg-white px-4 py-2.5 text-left shadow-[0_0_0_1px_rgba(10,37,64,0.04),0_12px_40px_rgba(10,37,64,0.14)]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ebe9ff] text-[#635bff]">
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-[#0a2540]">
              {total} job{total === 1 ? "" : "s"} running
            </span>
            <span className="block truncate text-[11px] text-[#697386]">Click to see progress</span>
          </span>
        </button>
      ) : (
        <div className="overflow-hidden rounded-3xl bg-white shadow-[0_0_0_1px_rgba(10,37,64,0.04),0_16px_48px_rgba(10,37,64,0.16)]">
          <div className="flex items-center justify-between gap-2 bg-[#f7f8fb] px-4 py-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-[#635bff]" />
              <p className="text-[13px] font-semibold text-[#0a2540]">{total} generating</p>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label="Collapse"
                onClick={() => setCollapsed(true)}
                className="rounded-md p-1.5 text-[#697386] hover:bg-white hover:text-[#0a2540]"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setDismissed(true)}
                className="rounded-md p-1.5 text-[#697386] hover:bg-white hover:text-[#0a2540]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <ActiveJobsList />
        </div>
      )}
    </div>
  );
}

/**
 * Phones: a slim progress line along the bottom of the header and a small
 * percentage chip that opens the list of running jobs.
 */
export function HeaderJobsIndicator() {
  const { total, overall } = useActiveJobs();
  const [open, setOpen] = useState(false);

  if (total === 0) return null;
  const pct = Math.round(overall);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${total} job${total === 1 ? "" : "s"} running, ${pct}% done`}
        className="flex h-8 items-center gap-1.5 rounded-full bg-[#ebe9ff] px-2.5 text-[12px] font-semibold tabular-nums text-[#635bff]"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {pct}%
        {total > 1 && <span className="font-medium text-[#635bff]/70">· {total}</span>}
      </button>

      {/* Progress line along the header's bottom edge */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-[#635bff]/10">
        <span
          className="block h-full bg-[#635bff] transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(3, pct)}%` }}
        />
      </span>

      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute inset-x-2 top-full z-50 mt-2 overflow-hidden rounded-3xl bg-white shadow-[0_0_0_1px_rgba(10,37,64,0.04),0_16px_48px_rgba(10,37,64,0.18)]">
            <div className="flex items-center justify-between bg-[#f7f8fb] px-4 py-2.5">
              <p className="text-[13px] font-semibold text-[#0a2540]">
                {total} generating · {pct}%
              </p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-[#697386] hover:bg-white hover:text-[#0a2540]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ActiveJobsList onNavigate={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}
