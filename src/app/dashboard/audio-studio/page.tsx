import { AudioStudioClient } from "./audio-studio-client";
import { AnonymousRouteFallback } from "@/components/dashboard/anonymous-route-fallback";

export default function AudioStudioPage() {
  return (
    <AnonymousRouteFallback
      title="Audio Studio"
      description="Turn pasted text or a PDF into an audiobook or podcast."
    >
      <AudioStudioClient />
    </AnonymousRouteFallback>
  );
}
