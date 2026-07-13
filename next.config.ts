import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Parent folder has another package-lock.json; pin the app root.
    root: path.join(__dirname),
  },
  serverExternalPackages: ["pdf-parse"],
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
