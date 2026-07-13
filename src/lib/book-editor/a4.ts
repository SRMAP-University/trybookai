/**
 * A4 at 96 CSS DPI — keeps typography proportional on screen.
 * 210mm ≈ 794px, 297mm ≈ 1123px, 1in margin ≈ 96px
 */
export const A4_SCREEN = {
  widthPx: 794,
  heightPx: 1123,
  marginPx: 96,
  footerPx: 36,
  sectionHeaderPx: 72,
} as const;

export const EDITOR_TYPOGRAPHY = {
  fontFamily: 'Georgia, "Times New Roman", Times, serif',
  fontSize: "12pt",
  lineHeight: 1.75,
} as const;

/** ~12pt × 1.75 line-height in CSS pixels */
export const EDITOR_LINE_HEIGHT_PX =
  12 * 1.75 * (96 / 72);

export const A4_CONTENT_HEIGHT_PX =
  A4_SCREEN.heightPx - A4_SCREEN.marginPx * 2;

export const A4_CONTENT_WIDTH_PX =
  A4_SCREEN.widthPx - A4_SCREEN.marginPx * 2;

export const A4_PAGE_STYLE = {
  width: `${A4_SCREEN.widthPx}px`,
  height: `${A4_SCREEN.heightPx}px`,
  padding: `${A4_SCREEN.marginPx}px`,
  boxSizing: "border-box" as const,
  fontFamily: EDITOR_TYPOGRAPHY.fontFamily,
  fontSize: EDITOR_TYPOGRAPHY.fontSize,
  lineHeight: EDITOR_TYPOGRAPHY.lineHeight,
};

export function contentAreaHeightPx(hasSectionHeader: boolean): number {
  return (
    A4_CONTENT_HEIGHT_PX -
    A4_SCREEN.footerPx -
    (hasSectionHeader ? A4_SCREEN.sectionHeaderPx : 0)
  );
}

export const A4_TEXT_STYLE = {
  fontFamily: EDITOR_TYPOGRAPHY.fontFamily,
  fontSize: EDITOR_TYPOGRAPHY.fontSize,
  lineHeight: EDITOR_TYPOGRAPHY.lineHeight,
  letterSpacing: "0.01em",
};

/** Rough capacity for aligning word-based pagination with the visible page */
export function estimateLinesPerPage(hasSectionHeader: boolean): number {
  return Math.floor(
    contentAreaHeightPx(hasSectionHeader) / EDITOR_LINE_HEIGHT_PX
  );
}

export function estimateWordsPerVisualPage(hasSectionHeader = false): number {
  const lines = estimateLinesPerPage(hasSectionHeader);
  const charsPerLine = Math.floor(A4_CONTENT_WIDTH_PX / 7.2);
  const wordsPerLine = Math.max(8, Math.floor(charsPerLine / 5.5));
  return lines * wordsPerLine;
}

/** @deprecated Use A4_TEXT_STYLE */
export const A4_TEXTAREA_STYLE = A4_TEXT_STYLE;

/** @deprecated Use contentAreaHeightPx */
export function contentAreaHeightMm(hasSectionHeader: boolean): string {
  return `${contentAreaHeightPx(hasSectionHeader)}px`;
}
