import { ImageResponse } from "next/og";
import { OG_SIZE, OgCard } from "@/lib/og-template";

export const alt = "BookAI — AI Book Generator";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <OgCard
        title="From one idea to a finished book."
        footer="Outline · write · cover · narrate · export"
      />
    ),
    { ...OG_SIZE }
  );
}
