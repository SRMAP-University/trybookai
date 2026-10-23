/**
 * Clean-ups applied wherever saved section text is shown, exported or read
 * aloud.
 */

/**
 * Remove a reasoning model's thinking that leaked into saved prose. Same rules
 * the writers apply before saving: paired `<think>` blocks, everything before
 * a stray `</think>`, and an unclosed `<think>` onward (a section that is only
 * an unclosed `<think>` comes out empty and needs rewriting).
 */
export { stripReasoning } from "@/lib/book-generator/core/text";

/** Remove `![caption](url)` picture lines, for clients that can only show plain text. */
export function stripImageLines(content: string): string {
  return content
    .replace(/^[ \t]*!\[[^\]]*\]\([^)]*\)[ \t]*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
