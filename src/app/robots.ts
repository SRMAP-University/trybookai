import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/book-public";

export default function robots(): MetadataRoute.Robots {
  const base = getAppUrl();
  return {
    rules: [
      {
        userAgent: "*",
        // Cover images are referenced by og:image and Book JSON-LD on public pages.
        allow: ["/", "/api/books/cover/"],
        disallow: [
          "/dashboard",
          "/dashboard/",
          "/api/",
          "/editor",
          "/editor/",
          "/adarsh",
          "/adarsh/",
          "/login",
          "/register",
          "/offline",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
