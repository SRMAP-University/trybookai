export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function wordsToPages(wordCount: number, wordsPerPage: number): number {
  if (wordCount <= 0) return 0;
  return Math.max(1, Math.ceil(wordCount / wordsPerPage));
}

export type SaveStatus = "saved" | "saving" | "unsaved" | "error";
