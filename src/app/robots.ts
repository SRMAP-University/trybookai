import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/book-public";

export default function robots(): MetadataRoute.Robots {
  const base = getAppUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/books", "/books/"],
        disallow: ["/dashboard", "/api/", "/login", "/register"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
