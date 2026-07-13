import { AudioStudioClient } from "./audio-studio-client";
import { AnonymousRouteFallback } from "@/components/dashboard/anonymous-route-fallback";

export default function AudioStudioPage() {
  return (
    <AnonymousRouteFallback
      title="Audio Studio"
      description="Generate audiobooks, podcasts, and theme music from completed books."
    >
      <AudioStudioClient />
    </AnonymousRouteFallback>
  );
}
