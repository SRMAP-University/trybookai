import { PLANS } from "@/lib/constants";

/** Spoken narration pace used for quota estimates (~words per minute). */
export const AUDIO_WORDS_PER_MINUTE = 150;

export function audioMinutesLimitForPlan(plan: keyof typeof PLANS): number {
  return PLANS[plan].audioMinutesLimit;
}

export function estimateAudioMinutesFromWords(wordCount: number): number {
  if (wordCount <= 0) return 0;
  return Math.max(1, Math.ceil(wordCount / AUDIO_WORDS_PER_MINUTE));
}

export function estimateAudioMinutesFromText(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return estimateAudioMinutesFromWords(words);
}

export function formatAudioMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${hours}h ${rem}m`;
}
