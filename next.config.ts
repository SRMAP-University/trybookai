import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Parent folder has another package-lock.json; pin the app root.
    root: path.join(__dirname),
  },
  // pdfkit loads AFM font metrics from disk via __dirname; bundling breaks that path.
  serverExternalPackages: ["pdf-parse", "pdfkit", "epub-gen-memory"],
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=0, must-revalidate",
        },
        {
          key: "Service-Worker-Allowed",
          value: "/",
        },
      ],
    },
    {
      source: "/manifest.webmanifest",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=86400, stale-while-revalidate=604800",
        },
      ],
    },
  ],
  // Prefer www as canonical — apex is often misconfigured at DNS/CDN.
  redirects: async () => [
    {
      source: "/:path*",
      has: [{ type: "host", value: "trybookai.com" }],
      destination: "https://www.trybookai.com/:path*",
      permanent: true,
    },
  ],
};

export default nextConfig;
