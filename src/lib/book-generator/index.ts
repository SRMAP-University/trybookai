import { db } from "@/lib/db";
import { dbTransaction } from "@/lib/db-transaction";
import { DEFAULT_AI_MODEL, OUTLINE_AI_MODEL, isGroqModel, isModelAvailable } from "@/lib/ai-models";
import { createChatCompletionDetailed } from "@/lib/book-generator/llm";
import { resolveGenerationShape } from "@/lib/book-generator/shape";
import { writeSection } from "@/lib/book-generator/section-writer";
import {
  buildStyleBlock,
  planBookOutline,
  type LlmCall,
} from "@/lib/book-generator/core";
import {
  hasIncompleteSections,
  seedBibleFromOutline,
} from "@/lib/book-context";

function completionCall(model: string): LlmCall {
  return (messages, options) =>
    createChatCompletionDetailed({
      model,
      messages,
      max_tokens: options.max_tokens,
      temperature: options.temperature,
    });
}

export async function generateOutline(
  bookId: string,
  onProgress?: (message: string) => void
) {
  const book = await db.book.findUniqueOrThrow({ where: { id: bookId } });
  const shape = resolveGenerationShape(book);
  const { chapterCount, sectionsPerChapter, wordsPerPage } = shape;

  await db.book.update({
    where: { id: bookId },
    data: { status: "OUTLINING" },
  });

  const outline = await planBookOutline(
    {
      title: book.title,
      genre: book.genre,
      description: book.description,
      templateId: book.templateId,
      customInstructions: book.customInstructions,
      includeExamples: book.includeExamples,
      language: book.language,
      targetPages: book.targetPages,
      wordsPerPage,
      chapterCount,
      sectionsPerChapter,
      styleBlock: buildStyleBlock(book, { includeCast: true }),
    },
    completionCall(isGroqModel(book.model) ? book.model : OUTLINE_AI_MODEL),
    onProgress
  );

  onProgress?.("Saving outline…");

  await dbTransaction(async (tx) => {
    await tx.chapter.deleteMany({ where: { bookId } });

    for (const chapter of outline.chapters) {
      await tx.chapter.create({
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

    await tx.book.update({
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
  });

  await seedBibleFromOutline(bookId).catch((error) => {
    console.warn(
      "[outline] seed bible failed:",
      error instanceof Error ? error.message : error
    );
  });

  return outline;
}

export async function generateSection(sectionId: string) {
  const section = await db.section.findUniqueOrThrow({
    where: { id: sectionId },
    select: {
      chapterId: true,
      chapter: { select: { bookId: true, book: { select: { model: true } } } },
    },
  });

  await db.chapter.update({
    where: { id: section.chapterId },
    data: { status: "GENERATING" },
  });

  await db.book.update({
    where: { id: section.chapter.bookId },
    data: { status: "GENERATING" },
  });

  const { content, wordCount, pageCount } = await writeSection(sectionId, {
    call: completionCall(section.chapter.book.model || DEFAULT_AI_MODEL),
  });

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

  // The old draft's notes would read as "already written" to the new one.
  await db.sectionState.deleteMany({ where: { section: { chapterId } } });
  await db.chapterState.upsert({
    where: { chapterId },
    create: {
      chapterId,
      charactersPresent: [],
      events: [],
      newFacts: [],
      openThreads: [],
    },
    update: {
      summary: null,
      location: null,
      charactersPresent: [],
      events: [],
      newFacts: [],
      openThreads: [],
    },
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

  if (await hasIncompleteSections(bookId)) {
    const msg =
      "Generation finished early with incomplete sections. Tap Resume to continue.";
    await db.book.update({
      where: { id: bookId },
      data: { status: "FAILED", errorMessage: msg },
    });
    throw new Error(msg);
  }

  await db.book.update({
    where: { id: bookId },
    data: {
      status: "COMPLETED",
      progress: 100,
      completedAt: new Date(),
    },
  });

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
