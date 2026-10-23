/**
 * Clean-ups applied wherever saved section text is shown, exported or read
 * aloud. Kept free of imports so any runtime can use it.
 */

/**
 * Remove a reasoning model's thinking that leaked into saved prose:
 * `<think>…</think>` blocks, everything before a stray `</think>`, and an
 * unclosed `<think>` partway through the text. A section that is nothing but
 * an unclosed `<think>` loses only the tag; it needs rewriting.
 */
export function stripReasoning(content: string): string {
  if (!/<\/?think>/i.test(content)) return content;
  let text = content.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const strayClose = text.search(/<\/think>/i);
  if (strayClose >= 0) text = text.slice(strayClose + "</think>".length);
  const open = text.search(/<think>/i);
  if (open > 0) text = text.slice(0, open);
  return text.replace(/<\/?think>/gi, "").trim();
}

/** Remove `![caption](url)` picture lines, for clients that can only show plain text. */
export function stripImageLines(content: string): string {
  return content
    .replace(/^[ \t]*!\[[^\]]*\]\([^)]*\)[ \t]*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
