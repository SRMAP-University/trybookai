import { countWords } from "@/lib/book-editor/utils";

export type EditorPage = {
  globalIndex: number;
  sectionId: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  sectionNumber: number;
  sectionTitle: string;
  pageInSection: number;
  sectionPageCount: number;
  content: string;
};

export function splitContentIntoPages(
  content: string,
  wordsPerPage: number
): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [""];

  const paragraphs = trimmed.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const pages: string[] = [];
  let currentParagraphs: string[] = [];
  let currentWords = 0;

  const flush = () => {
    if (currentParagraphs.length === 0) return;
    pages.push(currentParagraphs.join("\n\n"));
    currentParagraphs = [];
    currentWords = 0;
  };

  for (const paragraph of paragraphs) {
    const paraWords = countWords(paragraph);

    if (paraWords > wordsPerPage) {
      flush();
      const words = paragraph.split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length; i += wordsPerPage) {
        pages.push(words.slice(i, i + wordsPerPage).join(" "));
      }
      continue;
    }

    if (currentWords + paraWords > wordsPerPage && currentParagraphs.length > 0) {
      flush();
    }

    currentParagraphs.push(paragraph);
    currentWords += paraWords;
  }

  flush();
  return pages.length > 0 ? pages : [""];
}

export function mergePages(pages: string[]): string {
  return pages
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n");
}

type BookForPages = {
  wordsPerPage: number;
  chapters: {
    id: string;
    number: number;
    title: string;
    sections: {
      id: string;
      number: number;
      title: string;
      content: string | null;
    }[];
  }[];
};

export function buildEditorPages(
  book: BookForPages,
  sectionContents: Record<string, string>,
  wordsPerPageOverride?: number
): EditorPage[] {
  const wordsPerPage = wordsPerPageOverride ?? book.wordsPerPage;
  const pages: EditorPage[] = [];
  let globalIndex = 0;

  for (const chapter of book.chapters) {
    for (const section of chapter.sections) {
      const text = sectionContents[section.id] ?? section.content ?? "";
      const sectionPages = splitContentIntoPages(text, wordsPerPage);
      const sectionPageCount = Math.max(1, sectionPages.length);

      sectionPages.forEach((pageContent, pageInSection) => {
        pages.push({
          globalIndex,
          sectionId: section.id,
          chapterId: chapter.id,
          chapterNumber: chapter.number,
          chapterTitle: chapter.title,
          sectionNumber: section.number,
          sectionTitle: section.title,
          pageInSection,
          sectionPageCount,
          content: pageContent,
        });
        globalIndex += 1;
      });
    }
  }

  return pages.length > 0
    ? pages
    : [
        {
          globalIndex: 0,
          sectionId: "",
          chapterId: "",
          chapterNumber: 1,
          chapterTitle: "Untitled",
          sectionNumber: 1,
          sectionTitle: "Section 1",
          pageInSection: 0,
          sectionPageCount: 1,
          content: "",
        },
      ];
}

export function rebuildSectionContent(
  pages: EditorPage[],
  sectionId: string,
  updatedPageContent: string,
  pageInSection: number
): string {
  const sectionPages = pages
    .filter((p) => p.sectionId === sectionId)
    .sort((a, b) => a.pageInSection - b.pageInSection)
    .map((p) =>
      p.pageInSection === pageInSection ? updatedPageContent : p.content
    );

  return mergePages(sectionPages);
}

export function getSectionPageOffset(
  pages: EditorPage[],
  sectionId: string,
  pageInSection: number
): number {
  const sectionPages = pages
    .filter((p) => p.sectionId === sectionId)
    .sort((a, b) => a.pageInSection - b.pageInSection);

  let offset = 0;
  for (const page of sectionPages) {
    if (page.pageInSection === pageInSection) return offset;
    offset += page.content.length;
    if (page.content.length > 0) offset += 2; // \n\n between pages when merged
  }
  return offset;
}

export function findFirstPageIndex(pages: EditorPage[], sectionId: string): number {
  const index = pages.findIndex((p) => p.sectionId === sectionId);
  return index >= 0 ? index : 0;
}
