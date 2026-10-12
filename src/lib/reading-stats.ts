/** Average adult silent-reading speed, for reading-time estimates. */
export const READING_WPM = 250;

/** 3200 → "3.2k", 15000 → "15k", 640 → "640". */
export function formatWords(words: number) {
  if (words < 1000) return String(words);
  return `${(words / 1000).toFixed(words < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;
}

/** Reading time for a word count: "12 min", "1.5 hr", "14 hr". */
export function readingTime(words: number) {
  const minutes = Math.max(1, Math.round(words / READING_WPM));
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours.toFixed(hours < 10 ? 1 : 0).replace(/\.0$/, "")} hr`;
}

export function countWords(text: string | null | undefined) {
  const trimmed = text?.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
