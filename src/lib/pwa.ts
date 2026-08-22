import type { MetadataRoute } from "next";

import { DEFAULT_DESCRIPTION, SITE_NAME } from "@/lib/seo";

export const PWA_THEME_COLOR = "#635bff";
export const PWA_BACKGROUND_COLOR = "#ffffff";
export const PWA_DISPLAY = "standalone" as const;

export const PWA_ICONS = [
  {
    src: "/icon-192.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "any",
  },
  {
    src: "/icon-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "any",
  },
  {
    src: "/icon-maskable-192.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "maskable",
  },
  {
    src: "/icon-maskable-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
] as const satisfies MetadataRoute.Manifest["icons"];

export function buildWebManifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${SITE_NAME} — AI Book Generator`,
    short_name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    start_url: "/dashboard",
    scope: "/",
    display: PWA_DISPLAY,
    orientation: "portrait-primary",
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    categories: ["productivity", "books", "writing"],
    lang: "en",
    dir: "ltr",
    prefer_related_applications: false,
    icons: [...PWA_ICONS],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Dashboard",
        url: "/dashboard",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "New book",
        short_name: "New book",
        url: "/dashboard/books/new",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Song Studio",
        short_name: "Songs",
        url: "/dashboard/songs",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
