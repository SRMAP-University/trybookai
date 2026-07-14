import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/book-public";

export default function robots(): MetadataRoute.Robots {
  const base = getAppUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/books", "/books/", "/blog", "/blog/", "/features", "/about", "/privacy", "/terms"],
        disallow: ["/dashboard", "/api/", "/login", "/register", "/editor"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
