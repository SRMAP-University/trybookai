"use client";

import { Download, MonitorSmartphone, Share } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export function WebInstallSection() {
  if (isStandalone()) {
    return (
      <div className="rounded-2xl border border-[#e6ebf1] bg-[#f6f9fc] px-5 py-4 text-[14px] text-[#425466]">
        BookAI is installed on this device. Open it from your home screen or app
        drawer anytime.
      </div>
    );
  }

  async function handleInstallClick() {
    const promptEvent = (
      window as Window & {
        __bookaiDeferredInstall?: { prompt: () => Promise<void> };
      }
    ).__bookaiDeferredInstall;

    if (promptEvent) {
      await promptEvent.prompt();
      return;
    }

    document.getElementById("pwa-install-steps")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className="rounded-2xl border border-[#e6ebf1] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ebe9ff] text-[#635bff]">
          <MonitorSmartphone className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            Install the web app
          </h2>
          <p className="mt-1 text-[14px] leading-relaxed text-[#697386]">
            Add BookAI to your phone or desktop for one-tap access to your
            dashboard, books, and audio studio.
          </p>
        </div>
      </div>

      <Button
        type="button"
        className="mt-5 h-11 rounded-full bg-[#635bff] px-6 hover:bg-[#5851e5]"
        onClick={handleInstallClick}
      >
        <Download className="mr-2 h-4 w-4" />
        Install BookAI
      </Button>

      <div id="pwa-install-steps" className="mt-6 space-y-4">
        {isIos() ? (
          <ol className="space-y-2 text-[14px] leading-relaxed text-[#425466]">
            <li className="flex items-start gap-2">
              <Share className="mt-0.5 h-4 w-4 shrink-0 text-[#635bff]" />
              Open this page in Safari
            </li>
            <li>Tap Share, then Add to Home Screen</li>
            <li>Tap Add to install BookAI</li>
          </ol>
        ) : (
          <ol className="space-y-2 text-[14px] leading-relaxed text-[#425466]">
            <li>1. Tap Install BookAI above, or use your browser menu</li>
            <li>2. Choose Install app or Add to Home screen</li>
            <li>3. Open BookAI from your home screen or app list</li>
          </ol>
        )}
      </div>
    </div>
  );
}
