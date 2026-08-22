import { SongStudioClient } from "./song-studio-client";
import { AnonymousRouteFallback } from "@/components/dashboard/anonymous-route-fallback";

export default function SongStudioPage() {
  return (
    <AnonymousRouteFallback
      title="Song Studio"
      description="Write a brief or lyrics and generate an original vocal song."
    >
      <SongStudioClient />
    </AnonymousRouteFallback>
  );
}
