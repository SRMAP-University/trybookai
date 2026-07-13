/** Strip trailing " — Edition N" from a book title. */
export function getEditionBaseTitle(title: string): string {
  const stripped = title.replace(/\s*[—–-]\s*Edition\s+\d+$/i, "").trim();
  return stripped || title;
}

export function formatEditionTitle(baseTitle: string, edition: number): string {
  if (edition <= 1) return baseTitle;
  return `${baseTitle} — Edition ${edition}`;
}

export function getEditionRootId(book: {
  id: string;
  parentBookId: string | null;
}): string {
  return book.parentBookId ?? book.id;
}
