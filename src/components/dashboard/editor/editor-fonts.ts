import { Newsreader } from "next/font/google";

/** Long-form reading serif for manuscript text in the editor. */
export const manuscriptSerif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});
