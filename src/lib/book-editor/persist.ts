import { db } from "@/lib/db";
import { countWords, wordsToPages } from "@/lib/book-editor/utils";
import { applyBookProgress } from "@/lib/book-generator/progress";

export async function rollupChapter(chapterId: string) {
  const sections = await db.section.findMany({
    where: { chapterId },
    orderBy: { number: "asc" },
    select: { content: true, pageCount: true, wordCount: true },
  });

  const content = sections
    .map((s) => s.content?.trim())
    .filter(Boolean)
    .join("\n\n");

  const pageCount = sections.reduce((sum, s) => sum + s.pageCount, 0);
  const allDone = sections.length > 0 && sections.every((s) => s.wordCount > 0);

  await db.chapter.update({
    where: { id: chapterId },
    data: {
      content: content || null,
      pageCount,
      status: allDone ? "COMPLETED" : "GENERATING",
    },
  });
}

export async function saveSectionContent(
  sectionId: string,
  content: string,
  wordsPerPage: number
) {
  const wordCount = countWords(content);
  const pageCount = wordsToPages(wordCount, wordsPerPage);

  const section = await db.section.update({
    where: { id: sectionId },
    data: { content: content || null, wordCount, pageCount },
    select: { chapterId: true, chapter: { select: { bookId: true } } },
  });

  await rollupChapter(section.chapterId);
  await applyBookProgress(section.chapter.bookId);

  return { wordCount, pageCount };
}
