import type { MetadataRoute } from "next";

import { buildWebManifest } from "@/lib/pwa";

export default function manifest(): MetadataRoute.Manifest {
  return buildWebManifest();
}
