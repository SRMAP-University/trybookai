import { db } from "@/lib/db";
import { DEFAULT_AI_MODEL } from "@/lib/ai-models";
import {
  extractModelText,
  streamChatCompletion,
} from "@/lib/book-generator/llm";
import { generateOutline } from "@/lib/book-generator/index";
import {
  clearGenerationCancellation,
  GenerationCancelledError,
  isGenerationCancellationRequested,
  validateGenerationEligibility,
} from "@/lib/book-generator/background";
import {
  applyBookProgress,
  creditSectionPages,
} from "@/lib/book-generator/progress";
import { resolveGenerationShape } from "@/lib/book-generator/shape";
import {
  createBookEventEmitter,
  mergeEmitters,
} from "@/lib/book-generator/events";
import { generateAndSaveBookCover } from "@/lib/book-generator/cover";

async function throwIfCancelled(bookId: string) {
  const requested = isGenerationCancellationRequested(bookId);

  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { status: true },
  });

  if (!requested && book?.status !== "PAUSED") {
    return;
  }

  clearGenerationCancellation(bookId);

  const runningJob = await db.generationJob.findFirst({
    where: { bookId, status: "RUNNING" },
    orderBy: { createdAt: "desc" },
  });
  if (runningJob) {
    await db.generationJob.update({
      where: { id: runningJob.id },
      data: { status: "FAILED", error: "Cancelled", completedAt: new Date() },
    });
  }

  if (book?.status !== "PAUSED") {
    await db.book.update({
      where: { id: bookId },
      data: { status: "PAUSED", errorMessage: "Generation stopped by user" },
    });
  }

  throw new GenerationCancelledError();
}

export type StreamEvent =
  | { type: "phase"; phase: string; message?: string }
  | {
      type: "section_start";
      sectionId: string;
      chapterId: string;
      chapterNumber: number;
      chapterTitle: string;
      sectionNumber: number;
      sectionTitle: string;
    }
  | { type: "token"; sectionId: string; text: string }
  | {
      type: "section_done";
      sectionId: string;
      chapterId: string;
      wordCount: number;
      pageCount: number;
    }
  | {
      type: "progress";
      progress: number;
      currentPages: number;
      targetPages: number;
      status: string;
    }
  | { type: "outline_ready"; chapterCount: number }
  | { type: "cover_ready"; coverImage: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type StreamEmitter = (event: StreamEvent) => void;

const noopEmit: StreamEmitter = () => {};

async function updateJobProgress(
  jobId: string,
  data: { currentSectionId?: string; partialContent?: string }
) {
  // Single update — avoid findUnique + update (2 pool clients per draft tick).
  await db.generationJob.update({
    where: { id: jobId },
    data: {
      payload: data,
    },
  });
}

async function streamGenerateSection(
  sectionId: string,
  jobId: string,
  emit: StreamEmitter
) {
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

  await updateJobProgress(jobId, {
    currentSectionId: section.id,
    partialContent: "",
  });

  emit({
    type: "section_start",
    sectionId: section.id,
    chapterId: chapter.id,
    chapterNumber: chapter.number,
    chapterTitle: chapter.title,
    sectionNumber: section.number,
    sectionTitle: section.title,
  });

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

  const targetWords = pagesPerSection * wordsPerPage;
  const outline = book.outline as {
    synopsis?: string;
  } | null;

  const styleParts = [
    `Point of view: ${book.pov}`,
    `Tense: ${book.tense}`,
    `Language: ${book.language}`,
    `Tone: ${book.tone ?? "professional"}`,
    book.style ? `Style guide: ${book.style}` : null,
    book.customInstructions
      ? `Custom instructions: ${book.customInstructions}`
      : null,
  ].filter(Boolean);

  let draftContent = "";
  let lastPersist = 0;
  let persistInFlight: Promise<void> | null = null;
  let pendingPersist: string | null = null;

  /** Live UI already gets tokens via emit — only lightly sync DB so Neon isn't flooded. */
  const persistDraft = async (content: string, force = false) => {
    pendingPersist = content;
    if (persistInFlight) return persistInFlight;

    persistInFlight = (async () => {
      while (pendingPersist !== null) {
        const snapshot = pendingPersist;
        pendingPersist = null;
        const now = Date.now();
        if (!force && now - lastPersist < 3000) {
          break;
        }
        lastPersist = now;
        const draftWordCount = snapshot.split(/\s+/).filter(Boolean).length;
        try {
          // Job payload only during stream — avoids stacking section + progress writes.
          await updateJobProgress(jobId, {
            currentSectionId: section.id,
            partialContent: snapshot,
          });
          const estimatedPages = Math.min(
            book.targetPages,
            Math.max(
              book.currentPages ?? 0,
              Math.ceil(draftWordCount / wordsPerPage)
            )
          );
          emit({
            type: "progress",
            progress: Math.min(
              99,
              Math.round(
                (5 +
                  Math.min(1, draftWordCount / Math.max(1, targetWords)) * 90) *
                  10
              ) / 10
            ),
            currentPages: estimatedPages,
            targetPages: book.targetPages,
            status: "GENERATING",
          });
        } catch (error) {
          console.warn(
            "[generation] draft persist skipped:",
            error instanceof Error ? error.message : error
          );
        }
      }
    })().finally(() => {
      persistInFlight = null;
    });

    return persistInFlight;
  };

  const raw = await streamChatCompletion({
    model: book.model || DEFAULT_AI_MODEL,
    temperature: book.creativity ?? 0.7,
    max_tokens: Math.min(8192, Math.max(2048, targetWords * 2)),
    onToken: (text) => {
      if (!text) return;
      draftContent += text;
      emit({ type: "token", sectionId: section.id, text });

      if (Date.now() - lastPersist >= 3000) {
        void persistDraft(draftContent);
      }
    },
    messages: [
      {
        role: "system",
        content: `You are a professional author writing "${book.title}", a ${book.genre} book. Write approximately ${targetWords} words (~${pagesPerSection} pages). Maintain narrative consistency. Output only the final section prose — no headings, no reasoning, and no thinking notes.

Writing requirements:
${styleParts.join("\n")}`,
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

  const content = extractModelText(raw) || extractModelText(draftContent);
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const pageCount = Math.min(
    pagesPerSection,
    Math.max(1, Math.ceil(wordCount / wordsPerPage))
  );

  // Wait for any in-flight throttle, then write the final section once.
  await (persistInFlight as Promise<void> | null)?.catch(() => undefined);

  await db.section.update({
    where: { id: sectionId },
    data: { content, wordCount, pageCount },
  });
  await updateJobProgress(jobId, {
    currentSectionId: section.id,
    partialContent: content,
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

  const result = await applyBookProgress(book.id, { wordsPerPage });

  emit({
    type: "section_done",
    sectionId: section.id,
    chapterId: chapter.id,
    wordCount,
    pageCount,
  });
  if (result) {
    emit({
      type: "progress",
      progress: result.progress,
      currentPages: result.currentPages,
      targetPages: result.targetPages,
      status: result.allDone ? "COMPLETED" : "GENERATING",
    });
  }
}

async function getRunningJob(bookId: string, jobId?: string) {
  if (jobId) {
    const job = await db.generationJob.findUnique({
      where: { id: jobId },
    });
    if (job?.status === "RUNNING") return job;
    throw new GenerationCancelledError("Job was cancelled before it started");
  }

  const existing = await db.generationJob.findFirst({
    where: { bookId, status: "RUNNING" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  return db.generationJob.create({
    data: {
      bookId,
      type: "FULL_BOOK",
      status: "RUNNING",
      startedAt: new Date(),
    },
  });
}

function sectionNeedsGeneration(section: {
  content: string | null;
  wordCount: number;
}) {
  return section.wordCount === 0;
}

export async function runBookGeneration(
  bookId: string,
  userId: string,
  emit: StreamEmitter = noopEmit,
  jobId?: string
) {
  await validateGenerationEligibility(bookId, userId);

  const publisher = mergeEmitters(createBookEventEmitter(bookId), emit);
  const job = await getRunningJob(bookId, jobId);

  try {
    const book = await db.book.findUniqueOrThrow({
      where: { id: bookId },
    });

    await throwIfCancelled(bookId);

    if (!book.outline) {
      publisher({
        type: "phase",
        phase: "outlining",
        message: "Building outline…",
      });
      await db.book.update({
        where: { id: bookId },
        data: { status: "OUTLINING", progress: 2 },
      });
      await generateOutline(bookId, (message) => {
        publisher({
          type: "phase",
          phase: "outlining",
          message,
        });
      });
      await applyBookProgress(bookId);
      const chapterCount = await db.chapter.count({ where: { bookId } });
      publisher({ type: "outline_ready", chapterCount });
    }

    await throwIfCancelled(bookId);

    const coverStatus = await db.book.findUnique({
      where: { id: bookId },
      select: { coverImage: true },
    });
    if (!coverStatus?.coverImage) {
      void generateAndSaveBookCover(bookId)
        .then(({ coverImage }) => {
          publisher({ type: "cover_ready", coverImage });
        })
        .catch((error) => {
          console.error(`Cover generation failed for book ${bookId}:`, error);
        });
    }

    await throwIfCancelled(bookId);

    publisher({ type: "phase", phase: "writing", message: "Writing your book…" });

    const refreshed = await db.book.findUniqueOrThrow({
      where: { id: bookId },
      include: {
        chapters: {
          include: { sections: { orderBy: { number: "asc" } } },
          orderBy: { number: "asc" },
        },
      },
    });

    for (const chapter of refreshed.chapters) {
      let reachedTarget = false;
      for (const section of chapter.sections) {
        await throwIfCancelled(bookId);
        if (sectionNeedsGeneration(section)) {
          if (section.content && section.wordCount === 0) {
            await db.section.update({
              where: { id: section.id },
              data: { content: null },
            });
          }
          await streamGenerateSection(section.id, job.id, publisher);

          const pageCheck = await db.book.findUnique({
            where: { id: bookId },
            select: { currentPages: true, targetPages: true },
          });
          if (
            pageCheck &&
            pageCheck.currentPages >= pageCheck.targetPages
          ) {
            reachedTarget = true;
            break;
          }
        }
      }
      if (reachedTarget) break;
    }

    await db.generationJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        payload: {},
      },
    });
    publisher({ type: "done" });

    const finished = await db.book.findUnique({
      where: { id: bookId },
      select: {
        coverImage: true,
        userId: true,
        generateAudiobookOnComplete: true,
      },
    });

    if (finished?.generateAudiobookOnComplete) {
      void import("@/lib/audio-generator/background")
        .then(({ ensureAudioGenerationRunning }) =>
          ensureAudioGenerationRunning({
            bookId,
            userId: finished.userId,
            type: "AUDIOBOOK",
          })
        )
        .catch((error) => {
          console.error(
            `Auto audiobook failed for book ${bookId}:`,
            error
          );
        });
    }

    if (!finished?.coverImage) {
      void generateAndSaveBookCover(bookId)
        .then(({ coverImage }) => {
          publisher({ type: "cover_ready", coverImage });
        })
        .catch((error) => {
          console.error(`Cover generation failed for book ${bookId}:`, error);
        });
    }
  } catch (error) {
    if (error instanceof GenerationCancelledError) {
      publisher({
        type: "phase",
        phase: "cancelled",
        message: "Generation stopped",
      });
      return;
    }
    const message =
      error instanceof Error ? error.message : "Generation failed";
    await db.book.update({
      where: { id: bookId },
      data: { status: "FAILED", errorMessage: message },
    });
    await db.generationJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: message, completedAt: new Date() },
    });
    publisher({ type: "error", message });
    throw error;
  }
}

/** @deprecated Use runBookGeneration or ensureGenerationRunning */
export async function startGenerationStream(
  bookId: string,
  userId: string,
  emit: StreamEmitter
) {
  return runBookGeneration(bookId, userId, emit);
}
