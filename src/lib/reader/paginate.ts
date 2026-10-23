import { blockHtml, type ReaderBlock } from "@/lib/reader/blocks";

/** One printed page of the book's text. */
export type ReaderPage = {
  html: string;
  /** Index into the book's chapters */
  chapter: number;
  /** First page of a chapter: no running head, chapter header on top */
  start: boolean;
  /** Where the page begins: [chapter, block, word or item], to find it again after re-layout */
  anchor: [number, number, number];
};

/** Fewer words than this at the foot of a page and the paragraph moves to the next page instead. */
const MIN_SPLIT_WORDS = 7;

export function compareAnchors(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/**
 * Lay a book out into pages by measuring real text in `box`: a hidden element
 * with the page body's exact width, font and styles. Paragraphs and lists
 * split across pages; headings stay with the text after them; pictures move to
 * the next page whole. Yields between chapters so the page stays responsive.
 */
export async function paginateBook(
  chapters: { header: string; blocks: ReaderBlock[] }[],
  box: HTMLElement,
  pageHeight: number,
  job: { cancelled: boolean }
): Promise<ReaderPage[] | null> {
  const pages: ReaderPage[] = [];
  const limit = pageHeight - 1;
  const fits = () => box.getBoundingClientRect().height <= limit;

  for (let ci = 0; ci < chapters.length; ci += 1) {
    if (job.cancelled) return null;
    const { header, blocks } = chapters[ci];

    let parts: { html: string; heading: boolean }[] = [];
    let anchor: [number, number, number] = [ci, 0, 0];
    let start = true;

    const reset = (seed: { html: string; heading: boolean }[]) => {
      parts = seed;
      box.innerHTML = seed.map((p) => p.html).join("");
    };
    const append = (html: string) => {
      box.insertAdjacentHTML("beforeend", html);
      return box.lastElementChild as HTMLElement;
    };
    /** Nothing on the page yet but the chapter header and headings. */
    const pageEmpty = () => parts.slice(start ? 1 : 0).every((p) => p.heading);
    const flush = (next: [number, number, number]) => {
      // Keep a heading with the text that follows it, unless the page would be left empty.
      const carry: { html: string; heading: boolean }[] = [];
      if (!pageEmpty()) {
        while (parts.length > (start ? 1 : 0) && parts[parts.length - 1].heading) {
          carry.unshift(parts.pop()!);
        }
      }
      pages.push({ html: parts.map((p) => p.html).join(""), chapter: ci, start, anchor });
      start = false;
      anchor = next;
      reset(carry);
    };

    reset([{ html: header, heading: false }]);

    for (let bi = 0; bi < blocks.length; bi += 1) {
      const block = blocks[bi];

      if (block.kind === "p" || block.kind === "list") {
        const total = block.kind === "p" ? block.words.length : block.items.length;
        let from = 0;
        while (from < total) {
          const whole = blockHtml(block, { from, cont: from > 0 });
          const el = append(whole);
          if (fits()) {
            parts.push({ html: whole, heading: false });
            break;
          }
          el.remove();

          // Largest piece that still fits at the foot of this page.
          let lo = 1;
          let hi = total - from - 1;
          let best = 0;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const probe = append(blockHtml(block, { from, to: from + mid, cont: from > 0, split: true }));
            const ok = fits();
            probe.remove();
            if (ok) {
              best = mid;
              lo = mid + 1;
            } else {
              hi = mid - 1;
            }
          }

          const minPiece = block.kind === "p" ? MIN_SPLIT_WORDS : 1;
          if (best >= minPiece || (best > 0 && pageEmpty())) {
            const piece = blockHtml(block, { from, to: from + best, cont: from > 0, split: true });
            append(piece);
            parts.push({ html: piece, heading: false });
            from += best;
            flush([ci, bi, from]);
          } else if (pageEmpty()) {
            // Doesn't fit even on an empty page (a huge table cell): place it and move on.
            append(whole);
            parts.push({ html: whole, heading: false });
            flush([ci, bi + 1, 0]);
            break;
          } else {
            flush([ci, bi, from]);
          }
        }
        continue;
      }

      const html = blockHtml(block);
      const heading = block.kind === "h";
      // A scene break never starts a page.
      if (block.kind === "break" && parts.length === 0) continue;
      const el = append(html);
      if (fits()) {
        parts.push({ html, heading });
        continue;
      }
      el.remove();
      if (block.kind === "break") continue;
      flush([ci, bi, 0]);
      append(html);
      parts.push({ html, heading });
    }

    if (parts.length) {
      pages.push({ html: parts.map((p) => p.html).join(""), chapter: ci, start, anchor });
    }
    // Let the browser breathe between chapters.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  }

  box.innerHTML = "";
  return pages;
}
