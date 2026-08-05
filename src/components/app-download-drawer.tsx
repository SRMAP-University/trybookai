"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Smartphone } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const STORAGE_KEY = "bookai_android_drawer_dismissed_v1";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
const OPEN_DELAY_MS = 1600;

function apkUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ANDROID_APK_URL?.trim() ||
    "/download/android"
  );
}

function appVersion(): string {
  return process.env.NEXT_PUBLIC_ANDROID_APP_VERSION?.trim() || "1.0.1";
}

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

function rememberDismiss() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function AppDownloadDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const downloadHref = apkUrl();
  const version = appVersion();

  useEffect(() => {
    if (pathname?.startsWith("/download")) return;
    if (wasDismissedRecently()) return;

    const timer = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!open || qrDataUrl) return;
    let cancelled = false;
    void import("qrcode").then(async (QRCode) => {
      try {
        const url = await QRCode.toDataURL(downloadHref, {
          width: 220,
          margin: 1,
          color: { dark: "#0a2540", light: "#ffffff" },
          errorCorrectionLevel: "M",
        });
        if (!cancelled) setQrDataUrl(url);
      } catch {
        /* QR is optional — download button still works */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, downloadHref, qrDataUrl]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) rememberDismiss();
  }

  if (pathname?.startsWith("/download")) return null;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
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
            Scan the QR code with your phone, or download the APK. Updates can
            arrive over the air.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col items-center gap-5 px-6 pt-2">
          <div className="rounded-2xl border border-[#e6ebf1] bg-[#f6f9fc] p-3">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="QR code to download BookAI Android app"
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

          <p className="text-[12px] text-[#697386]">Version {version}</p>

          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <a
              href={downloadHref}
              download="bookai.apk"
              className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-[#0a2540] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[#143556]"
              onClick={() => rememberDismiss()}
            >
              Download APK
            </a>
            <a
              href="/download"
              className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-[#e6ebf1] bg-white px-5 text-[14px] font-medium text-[#0a2540] transition-colors hover:bg-[#f6f9fc]"
              onClick={() => rememberDismiss()}
            >
              Open download page
            </a>
          </div>

          <button
            type="button"
            className="pb-1 text-[13px] text-[#697386] hover:text-[#0a2540]"
            onClick={() => handleOpenChange(false)}
          >
            Not now
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
