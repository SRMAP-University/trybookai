import type { MetadataRoute } from "next";

import { getAppUrl } from "@/lib/book-public";

export default function manifest(): MetadataRoute.Manifest {
  const base = getAppUrl();
  return {
    name: "BookAI — AI Book Generator",
    short_name: "BookAI",
    description:
      "Generate full-length books with AI. Outline, write, export manuscripts and audiobooks.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#635bff",
    icons: [
      {
        src: `${base}/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${base}/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
