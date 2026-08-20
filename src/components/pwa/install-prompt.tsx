"use client";

import { useEffect, useState } from "react";
import { Download, Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const DISMISS_KEY = "bookai_pwa_install_dismissed_v1";
const SESSION_SHOWN_KEY = "bookai_pwa_install_shown_session";
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

/** Survives layout remounts during client navigations in this tab. */
let autoPromptedThisLoad = false;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function wasDismissedRecently() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

function rememberDismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function shownThisVisit() {
  if (autoPromptedThisLoad) return true;
  try {
    return sessionStorage.getItem(SESSION_SHOWN_KEY) === "1";
  } catch {
    return false;
  }
}

function markShownThisVisit() {
  autoPromptedThisLoad = true;
  try {
    sessionStorage.setItem(SESSION_SHOWN_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function InstallPrompt() {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasDismissedRecently()) {
      setReady(true);
      return;
    }

    const openOnce = (ios: boolean) => {
      if (shownThisVisit() || wasDismissedRecently() || isStandalone()) {
        return;
      }
      markShownThisVisit();
      setShowIosHint(ios);
      setOpen(true);
    };

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      const installEvent = event as BeforeInstallPromptEvent;
      (
        window as Window & {
          __bookaiDeferredInstall?: BeforeInstallPromptEvent;
        }
      ).__bookaiDeferredInstall = installEvent;
      setDeferredPrompt(installEvent);
      window.setTimeout(() => openOnce(false), 1200);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    setReady(true);

    const existing = (
      window as Window & {
        __bookaiDeferredInstall?: BeforeInstallPromptEvent;
      }
    ).__bookaiDeferredInstall;
    if (existing) {
      setDeferredPrompt(existing);
    }

    if (isIos()) {
      window.setTimeout(() => {
        if (!isStandalone() && !wasDismissedRecently()) {
          openOnce(true);
        }
      }, 1800);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;

    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        rememberDismiss();
        setOpen(false);
      }
    } finally {
      setDeferredPrompt(null);
      setInstalling(false);
    }
  }

  function handleDismiss() {
    rememberDismiss();
    setOpen(false);
  }

  if (!ready || isStandalone()) return null;

  return (
    <>
      {!open &&
        !shownThisVisit() &&
        (deferredPrompt || showIosHint) && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border border-[#e6ebf1] bg-white px-4 py-2.5 text-[13px] font-medium text-[#0a2540] shadow-[0_10px_30px_rgba(10,37,64,0.14)] transition-transform hover:scale-[1.02] max-md:bottom-24"
          aria-label="Install BookAI app"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#635bff] text-white">
            <Download className="h-3.5 w-3.5" />
          </span>
          Install app
        </button>
      )}

      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) markShownThisVisit();
        }}
      >
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
              Install BookAI
            </SheetTitle>
            <SheetDescription className="max-w-[340px] text-[14px] leading-relaxed text-[#697386]">
              {showIosHint
                ? "Add BookAI to your home screen for quick access to your dashboard, books, and audio studio."
                : "Install BookAI on this device for a faster, app-like experience with your dashboard one tap away."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col items-center gap-4 px-6 pt-2">
            {showIosHint ? (
              <ol className="w-full space-y-2 rounded-xl border border-[#e6ebf1] bg-[#f6f9fc] px-4 py-3 text-left text-[14px] leading-relaxed text-[#425466]">
                <li className="flex items-start gap-2">
                  <Share className="mt-0.5 h-4 w-4 shrink-0 text-[#635bff]" />
                  Tap Share in Safari
                </li>
                <li className="flex items-start gap-2">
                  <Download className="mt-0.5 h-4 w-4 shrink-0 text-[#635bff]" />
                  Choose Add to Home Screen
                </li>
              </ol>
            ) : (
              <Button
                className="h-11 w-full rounded-full bg-[#635bff] hover:bg-[#5851e5]"
                onClick={handleInstall}
                disabled={!deferredPrompt || installing}
              >
                {installing ? "Installing…" : "Install BookAI"}
              </Button>
            )}

            <button
              type="button"
              className="inline-flex items-center gap-1 pb-1 text-[13px] text-[#697386] hover:text-[#0a2540]"
              onClick={handleDismiss}
            >
              <X className="h-3.5 w-3.5" />
              Not now
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
