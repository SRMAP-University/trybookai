import { Instrument_Serif, Literata } from "next/font/google";

/** Display serif for home page headlines (exposed as --font-serif-display). */
export const serifDisplay = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif-display",
  display: "swap",
});

/** Book text on public reading pages: a serif designed for long-form screen reading. */
export const readingSerif = Literata({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});
