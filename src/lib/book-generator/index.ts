import { db } from "@/lib/db";
import { DEFAULT_AI_MODEL, isModelAvailable } from "@/lib/ai-models";
import {
  createChatCompletion,
  extractJsonPayload,
  extractModelText,
} from "@/lib/book-generator/llm";
import {
  applyBookProgress,
  creditSectionPages,
} from "@/lib/book-generator/progress";
import { resolveGenerationShape } from "@/lib/book-generator/shape";

interface BookOutline {
  title: string;
  synopsis: string;
  chapters: {
    number: number;
    title: string;
    summary: string;
    sections: { number: number; title: string; summary: string }[];
  }[];
}

type BookSettings = {
  title: string;
  description: string | null;
  genre: string | null;
  tone: string | null;
  audience: string | null;
  style: string | null;
  targetPages: number;
  pov: string;
  tense: string;
  language: string;
  chapterCount: number | null;
  sectionsPerChapter: number;
  wordsPerPage: number;
  includeDialogue: boolean;
  includeExamples: boolean;
  customInstructions: string | null;
  characters: unknown;
  themes: unknown;
  forbiddenTopics: string | null;
  model: string;
  creativity: number;
  outline: unknown;
};

function wordsForPages(pages: number, wordsPerPage: number): number {
  return pages * wordsPerPage;
}

function formatList(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join(", ");
  }
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function buildStyleBlock(book: BookSettings): string {
  const parts = [
    `Point of view: ${book.pov}`,
    `Tense: ${book.tense}`,
    `Language: ${book.language}`,
    `Tone: ${book.tone ?? "professional"}`,
    `Audience: ${book.audience ?? "general readers"}`,
    book.includeDialogue
      ? "Include natural dialogue where appropriate."
      : "Minimize or avoid dialogue.",
    book.includeExamples
      ? "Include concrete examples, frameworks, or case studies."
      : "Focus on narrative or exposition without instructional examples.",
  ];

  if (book.style) parts.push(`Style guide: ${book.style}`);
  if (book.customInstructions)
    parts.push(`Custom instructions: ${book.customInstructions}`);
  if (book.characters)
    parts.push(`Characters / cast: ${formatList(book.characters)}`);
  if (book.themes) parts.push(`Themes: ${formatList(book.themes)}`);
  if (book.forbiddenTopics)
    parts.push(`Avoid these topics: ${book.forbiddenTopics}`);

  return parts.join("\n");
}

export async function generateOutline(bookId: string) {
  const book = await db.book.findUniqueOrThrow({ where: { id: bookId } });
  const shape = resolveGenerationShape(book);
  const { chapterCount, sectionsPerChapter, wordsPerPage } = shape;

  await db.book.update({
    where: { id: bookId },
    data: { status: "OUTLINING" },
  });

  const styleBlock = buildStyleBlock(book);

  const raw = await createChatCompletion({
    model: book.model || DEFAULT_AI_MODEL,
    temperature: book.creativity ?? 0.7,
    json: true,
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `You are an expert book architect. Create detailed book outlines with exactly ${chapterCount} chapters, each with exactly ${sectionsPerChapter} sections. Return JSON with: title, synopsis, chapters[{number, title, summary, sections[{number, title, summary}]}]. Write all titles and summaries in the requested language. Keep the outline appropriate for a short ${book.targetPages}-page book — concise chapters and sections.`,
      },
      {
        role: "user",
        content: `Create an outline for a ${book.targetPages}-page ${book.genre ?? "general"} book titled "${book.title}".
${book.description ? `Description: ${book.description}` : ""}

Writing requirements:
${styleBlock}`,
      },
    ],
  });

  const outline = JSON.parse(extractJsonPayload(raw)) as BookOutline;

  await db.chapter.deleteMany({ where: { bookId } });

  for (const chapter of outline.chapters) {
    await db.chapter.create({
      data: {
        bookId,
        number: chapter.number,
        title: chapter.title,
        summary: chapter.summary,
        sections: {
          create: chapter.sections.map((s) => ({
            number: s.number,
            title: s.title,
          })),
        },
      },
    });
  }

  await db.book.update({
    where: { id: bookId },
    data: {
      outline: outline as object,
      status: "DRAFT",
      progress: 5,
      chapterCount,
      sectionsPerChapter,
      wordsPerPage,
    },
  });

  return outline;
}

export async function generateSection(sectionId: string) {
  const section = await db.section.findUniqueOrThrow({
    where: { id: sectionId },
    include: {
      chapter: {
        include: {
          book: true,
          sections: { orderBy: { number: "asc" } },
        },
      },
    },
  });

  const { chapter } = section;
  const { book } = chapter;
  const shape = resolveGenerationShape(book);
  const { sectionsPerChapter, wordsPerPage, pagesPerSection } = shape;

  await db.chapter.update({
    where: { id: chapter.id },
    data: { status: "GENERATING" },
  });

  await db.book.update({
    where: { id: book.id },
    data: { status: "GENERATING" },
  });

  const priorSections = chapter.sections
    .filter((s) => s.number < section.number && s.content)
    .map((s) => `### ${s.title}\n${s.content}`)
    .join("\n\n");

  const priorChapters = await db.chapter.findMany({
    where: {
      bookId: book.id,
      number: { lt: chapter.number },
      status: "COMPLETED",
    },
    select: { title: true, summary: true },
    orderBy: { number: "asc" },
  });

  const contextSummary = priorChapters
    .map((c) => `Chapter ${c.title}: ${c.summary}`)
    .join("\n");

  const targetWords = wordsForPages(pagesPerSection, wordsPerPage);
  const outline = book.outline as unknown as BookOutline | null;
  const styleBlock = buildStyleBlock(book);

  const raw = await createChatCompletion({
    model: book.model || DEFAULT_AI_MODEL,
    temperature: book.creativity ?? 0.7,
    max_tokens: Math.min(8192, Math.max(2048, targetWords * 2)),
    messages: [
      {
        role: "system",
        content: `You are a professional author writing "${book.title}", a ${book.genre} book. Write approximately ${targetWords} words (~${pagesPerSection} pages). Maintain narrative consistency. Output only the section content, no headings.

Writing requirements:
${styleBlock}`,
      },
      {
        role: "user",
        content: `Book synopsis: ${outline?.synopsis ?? book.description ?? ""}

Previous chapters context:
${contextSummary}

Current chapter: "${chapter.title}" - ${chapter.summary}

Prior sections in this chapter:
${priorSections}

Write section "${section.title}" (Section ${section.number} of ${sectionsPerChapter}).`,
      },
    ],
  });

  const content = extractModelText(raw);
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const pageCount = Math.max(1, Math.ceil(wordCount / wordsPerPage));

  await db.section.update({
    where: { id: sectionId },
    data: { content, wordCount, pageCount },
  });

  const allSections = await db.section.findMany({
    where: { chapterId: chapter.id },
  });
  const chapterComplete = allSections.every((s) =>
    s.id === sectionId ? true : s.wordCount > 0
  );

  if (chapterComplete) {
    const chapterContent = allSections
      .sort((a, b) => a.number - b.number)
      .map((s) => (s.id === sectionId ? content : s.content))
      .join("\n\n");

    const chapterPages = allSections.reduce(
      (sum, s) => sum + (s.id === sectionId ? pageCount : s.pageCount),
      0
    );

    await db.chapter.update({
      where: { id: chapter.id },
      data: {
        content: chapterContent,
        pageCount: chapterPages,
        status: "COMPLETED",
      },
    });
  }

  await creditSectionPages(book.userId, pageCount);
  await applyBookProgress(book.id, { wordsPerPage });

  return { content, wordCount, pageCount };
}

export async function regenerateChapter(chapterId: string, userId: string) {
  const chapter = await db.chapter.findFirst({
    where: { id: chapterId, book: { userId } },
    include: {
      sections: { orderBy: { number: "asc" } },
      book: true,
    },
  });

  if (!chapter) throw new Error("Chapter not found");

  await db.section.updateMany({
    where: { chapterId },
    data: { content: null, wordCount: 0, pageCount: 0 },
  });

  await db.chapter.update({
    where: { id: chapterId },
    data: { content: null, pageCount: 0, status: "PENDING" },
  });

  await db.book.update({
    where: { id: chapter.bookId },
    data: { status: "GENERATING", errorMessage: null },
  });

  for (const section of chapter.sections) {
    await generateSection(section.id);
  }

  return db.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    include: { sections: { orderBy: { number: "asc" } } },
  });
}

export async function processBookGeneration(bookId: string) {
  const book = await db.book.findUniqueOrThrow({
    where: { id: bookId },
    include: {
      chapters: {
        include: { sections: { orderBy: { number: "asc" } } },
        orderBy: { number: "asc" },
      },
    },
  });

  if (!book.outline) {
    await generateOutline(bookId);
    return processBookGeneration(bookId);
  }

  for (const chapter of book.chapters) {
    for (const section of chapter.sections) {
      if (!section.content) {
        await generateSection(section.id);
      }
    }
  }

  return db.book.findUniqueOrThrow({ where: { id: bookId } });
}

export async function startGeneration(bookId: string, userId: string) {
  const book = await db.book.findUniqueOrThrow({
    where: { id: bookId, userId },
    include: { user: true },
  });

  const user = book.user;
  const remaining = user.pagesLimit - user.pagesUsed;

  if (book.targetPages > remaining) {
    throw new Error(
      `Insufficient page credits. You have ${remaining} pages remaining.`
    );
  }

  if (!isModelAvailable(book.model, user.plan)) {
    throw new Error("This model requires a Pro or Enterprise plan.");
  }

  const job = await db.generationJob.create({
    data: {
      bookId,
      type: "FULL_BOOK",
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    await processBookGeneration(bookId);
    await db.generationJob.update({
      where: { id: job.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generation failed";
    await db.book.update({
      where: { id: bookId },
      data: { status: "FAILED", errorMessage: message },
    });
    await db.generationJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        error: message,
        completedAt: new Date(),
      },
    });
    throw error;
  }

  return db.book.findUniqueOrThrow({ where: { id: bookId } });
}
