"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type TawkApi = {
  onLoad?: () => void;
  hideWidget?: () => void;
  showWidget?: () => void;
};

declare global {
  interface Window {
    Tawk_API?: TawkApi;
  }
}

/** Where the chat bubble would cover the page's own controls. */
function shouldHide(pathname: string): boolean {
  if (pathname.startsWith("/editor")) return true;
  // Shared Story Reels are a full-screen player.
  if (pathname.startsWith("/r/")) return true;
  // The new-book page has a sticky create button above the phone nav.
  return (
    pathname === "/dashboard/books/new" &&
    window.matchMedia("(max-width: 1023px)").matches
  );
}

let hidden = false;
/** Full-screen overlays (the reel player) open on top of the current route. */
let overlays = 0;

function apply() {
  const api = window.Tawk_API;
  if (!api || typeof api.hideWidget !== "function") return;
  try {
    if (hidden || overlays > 0) api.hideWidget();
    else api.showWidget?.();
  } catch {
    /* widget not ready */
  }
}

/**
 * Shows or hides the Tawk.to bubble per route. The widget loads lazily (see
 * the root layout), so the current choice is also applied once it loads.
 */
export function TawkVisibility() {
  const pathname = usePathname();

  useEffect(() => {
    hidden = shouldHide(pathname);
    const api = (window.Tawk_API ??= {});
    if (typeof api.hideWidget === "function") {
      apply();
    } else if (!api.onLoad) {
      api.onLoad = apply;
    }
  }, [pathname]);

  return null;
}

/** Hide the bubble while a full-screen overlay is open; call the result to release. */
export function holdTawkHidden(): () => void {
  overlays += 1;
  apply();
  return () => {
    overlays = Math.max(0, overlays - 1);
    apply();
  };
}
