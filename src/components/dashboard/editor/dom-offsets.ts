/**
 * Maps a point in rendered manuscript (BookManuscript output) back to an
 * offset in the section's Markdown source. Rendering drops markup (**, #, |),
 * so we locate the clicked text node's text in the source, choosing the
 * occurrence nearest the node's relative position in the section.
 */

function textNodeAt(node: Node, offset: number): { node: Text; offset: number } | null {
  if (node.nodeType === Node.TEXT_NODE) return { node: node as Text, offset };

  const walkerFrom = (root: Node, last: boolean): Text | null => {
    // A tree walker never returns its own root, so a bare text node is the answer.
    if (root.nodeType === Node.TEXT_NODE) return root as Text;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let found: Text | null = null;
    while (walker.nextNode()) {
      found = walker.currentNode as Text;
      if (!last) break;
    }
    return found;
  };

  const child = node.childNodes[offset];
  if (child) {
    const first = walkerFrom(child, false);
    if (first) return { node: first, offset: 0 };
  }
  const last = walkerFrom(node, true);
  return last ? { node: last, offset: last.textContent?.length ?? 0 } : null;
}

export function sourceOffsetFromDom(
  container: HTMLElement,
  node: Node | null,
  nodeOffset: number,
  source: string
): number | null {
  if (!node || !container.contains(node)) return null;
  const point = textNodeAt(node, nodeOffset);
  if (!point) return null;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;
  let before = -1;
  while (walker.nextNode()) {
    const current = walker.currentNode as Text;
    if (current === point.node) before = total;
    total += current.textContent?.length ?? 0;
  }
  if (before < 0) return null;

  const ratio = (before + point.offset) / Math.max(1, total);
  const expected = ratio * source.length;
  const nodeText = point.node.textContent ?? "";

  if (nodeText.trim()) {
    let best = -1;
    let bestDistance = Infinity;
    let index = source.indexOf(nodeText);
    while (index !== -1) {
      const distance = Math.abs(index - expected);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
      index = source.indexOf(nodeText, index + 1);
    }
    if (best !== -1) return best + Math.min(point.offset, nodeText.length);
  }

  return Math.max(0, Math.min(source.length, Math.round(expected)));
}
