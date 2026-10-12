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
  // The new-book page has a sticky create button above the phone nav.
  return (
    pathname === "/dashboard/books/new" &&
    window.matchMedia("(max-width: 1023px)").matches
  );
}

let hidden = false;

function apply() {
  const api = window.Tawk_API;
  if (!api || typeof api.hideWidget !== "function") return;
  try {
    if (hidden) api.hideWidget();
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
