import { Instrument_Serif } from "next/font/google";

/** Display serif for home page headlines (exposed as --font-serif-display). */
export const serifDisplay = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif-display",
  display: "swap",
});
