"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Smartphone, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ANDROID_PLAY_STORE_URL as PLAY_STORE_URL } from "@/lib/constants";

const SHEET_STORAGE_KEY = "bookai_android_drawer_dismissed_v2";
const LANDING_QR_STORAGE_KEY = "bookai_landing_qr_collapsed_v1";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
const OPEN_DELAY_MS = 800;

function wasDismissedRecently(key: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

function rememberDismiss(key: string) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function clearDismiss(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function useViewport() {
  const [ready, setReady] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  const [isLarge, setIsLarge] = useState(false);

  useEffect(() => {
    const phoneMq = window.matchMedia("(max-width: 767px)");
    // Treat tablet/desktop as “big screen” for the corner QR.
    const largeMq = window.matchMedia("(min-width: 768px)");
    const sync = () => {
      setIsPhone(phoneMq.matches);
      setIsLarge(largeMq.matches);
      setReady(true);
    };
    sync();
    phoneMq.addEventListener("change", sync);
    largeMq.addEventListener("change", sync);
    return () => {
      phoneMq.removeEventListener("change", sync);
      largeMq.removeEventListener("change", sync);
    };
  }, []);

  return { ready, isPhone, isLarge };
}

function useQrDataUrl(href: string, enabled: boolean) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void import("qrcode").then(async (QRCode) => {
      try {
        const url = await QRCode.toDataURL(href, {
          width: 200,
          margin: 1,
          color: { dark: "#111111", light: "#ffffff" },
          errorCorrectionLevel: "M",
        });
        if (!cancelled) setQrDataUrl(url);
      } catch {
        /* QR is optional */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, href]);

  return qrDataUrl;
}

/** Compact bottom-left QR card for landing page on large screens. */
function LandingQrDrawer({
  expanded,
  onExpand,
  onCollapse,
}: {
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}) {
  const qrDataUrl = useQrDataUrl(PLAY_STORE_URL, expanded);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onExpand}
        className="fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-full border border-[#e8e8e6] bg-white px-3.5 py-2.5 text-[13px] font-medium text-[#111] shadow-[0_10px_30px_rgba(17,17,17,0.14)] transition-transform hover:scale-[1.02]"
        aria-label="Show Android app download QR"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#111] text-white">
          <Smartphone className="h-3.5 w-3.5" />
        </span>
        Get the app
      </button>
    );
  }

  return (
    <aside
      className="fixed bottom-6 left-6 z-50 w-[196px]"
      aria-label="Download BookAI Android app"
    >
      <div className="relative rounded-2xl border border-[#e8e8e6] bg-white p-3.5 shadow-[0_12px_40px_rgba(17,17,17,0.12)]">
        <button
          type="button"
          onClick={onCollapse}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-[#6b6b6b] transition-colors hover:bg-[#f3f3f1] hover:text-[#111]"
          aria-label="Minimize"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="mb-2.5 flex items-center gap-2 pr-6">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#111] text-white">
            <Smartphone className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-[13px] font-semibold leading-tight tracking-[-0.02em] text-[#111]">
              Get the app
            </p>
            <p className="text-[11px] text-[#6b6b6b]">Scan for Google Play</p>
          </div>
        </div>

        <div className="rounded-xl border border-[#e8e8e6] bg-[#f3f3f1] p-2">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="QR code for Book AI on Google Play"
              width={160}
              height={160}
              className="mx-auto h-40 w-40"
            />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center text-[12px] text-[#6b6b6b]">
              Loading…
            </div>
          )}
        </div>

        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex h-9 w-full items-center justify-center rounded-full bg-[#111] text-[12px] font-medium text-white transition-colors hover:bg-[#2a2a2a]"
        >
          Get it on Google Play
        </a>
      </div>
    </aside>
  );
}

export function AppDownloadDrawer() {
  const pathname = usePathname();
  const { ready, isPhone, isLarge } = useViewport();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [landingExpanded, setLandingExpanded] = useState(true);
  const isLanding = pathname === "/";
  const useCornerQr = isLanding && isLarge && !isPhone;
  const qrDataUrl = useQrDataUrl(
    PLAY_STORE_URL,
    sheetOpen && !useCornerQr && !isPhone
  );

  useEffect(() => {
    if (!ready) return;
    if (pathname?.startsWith("/download")) return;

    if (useCornerQr) {
      // Landing QR: expand unless user minimized recently; chip always stays.
      setLandingExpanded(!wasDismissedRecently(LANDING_QR_STORAGE_KEY));
      return;
    }

    if (wasDismissedRecently(SHEET_STORAGE_KEY)) return;
    const timer = window.setTimeout(() => setSheetOpen(true), OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pathname, ready, useCornerQr]);

  function handleSheetOpenChange(next: boolean) {
    setSheetOpen(next);
    if (!next) rememberDismiss(SHEET_STORAGE_KEY);
  }

  if (pathname?.startsWith("/download") || !ready) return null;

  // Landing + large screens: always show bottom-left QR (or compact chip)
  if (useCornerQr) {
    return (
      <LandingQrDrawer
        expanded={landingExpanded}
        onExpand={() => {
          clearDismiss(LANDING_QR_STORAGE_KEY);
          setLandingExpanded(true);
        }}
        onCollapse={() => {
          rememberDismiss(LANDING_QR_STORAGE_KEY);
          setLandingExpanded(false);
        }}
      />
    );
  }

  // Phones + dashboard: bottom sheet (no QR on phone)
  return (
    <Sheet open={sheetOpen} onOpenChange={handleSheetOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-w-lg gap-0 rounded-t-3xl border-[#e6ebf1] bg-white px-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_40px_rgba(10,37,64,0.12)]"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#e6ebf1]" />

        <SheetHeader className="items-center px-6 pb-2 text-center">
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ebe9ff] text-[#635bff]">
            <Smartphone className="h-5 w-5" />
          </div>
          <SheetTitle className="text-[22px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            Get BookAI on Android
          </SheetTitle>
          <SheetDescription className="max-w-[340px] text-[14px] leading-relaxed text-[#697386]">
            {isPhone
              ? "Install the official Book AI app from Google Play."
              : "Scan the QR code with your phone to open Book AI on Google Play."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col items-center gap-5 px-6 pt-2">
          {!isPhone && (
            <div className="rounded-2xl border border-[#e6ebf1] bg-[#f6f9fc] p-3">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="QR code for Book AI on Google Play"
                  width={180}
                  height={180}
                  className="h-[180px] w-[180px]"
                />
              ) : (
                <div className="flex h-[180px] w-[180px] items-center justify-center text-[13px] text-[#697386]">
                  Loading QR…
                </div>
              )}
            </div>
          )}

          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#0a2540] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[#143556] sm:w-auto sm:min-w-[240px]"
            onClick={() => rememberDismiss(SHEET_STORAGE_KEY)}
          >
            Get it on Google Play
          </a>

          <button
            type="button"
            className="pb-1 text-[13px] text-[#697386] hover:text-[#0a2540]"
            onClick={() => handleSheetOpenChange(false)}
          >
            Not now
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
