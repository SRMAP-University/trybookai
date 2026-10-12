import type { Metadata } from "next";
import { ReelFeed } from "@/components/reels/reel-feed";

export const metadata: Metadata = { title: "Reels" };

export default function ReelsPage() {
  return <ReelFeed />;
}
