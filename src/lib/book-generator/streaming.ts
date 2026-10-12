import { db } from "@/lib/db";
import { DEFAULT_AI_MODEL } from "@/lib/ai-models";
import { streamChatCompletionDetailed } from "@/lib/book-generator/llm";
import { generateOutline } from "@/lib/book-generator/index";
import {
  clearGenerationCancellation,
  GenerationCancelledError,
  isGenerationCancellationRequested,
  validateGenerationEligibility,
} from "@/lib/book-generator/background";
import { applyBookProgress } from "@/lib/book-generator/progress";
import { writeSection } from "@/lib/book-generator/section-writer";
import {
  countWords,
  endsCleanly,
  sectionWordTarget,
  WORDS_PER_PAGE,
  type LlmCall,
} from "@/lib/book-generator/core";
import {
  createBookEventEmitter,
  mergeEmitters,
} from "@/lib/book-generator/events";
import { generateAndSaveBookCover } from "@/lib/book-generator/cover";
import {
  nextPushMilestone,
  notifyBookProgress,
} from "@/lib/push";
import { hasIncompleteSections } from "@/lib/book-context";

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
    include: { chapter: { include: { book: true } } },
  });

  const { chapter } = section;
  const { book } = chapter;
  const wordsPerPage = book.wordsPerPage || WORDS_PER_PAGE;
  const totalSections = await db.section.count({
    where: { chapter: { bookId: book.id } },
  });
  const targetWords = sectionWordTarget(book, totalSections);

  await updateJobProgress(jobId, {
    currentSectionId: section.id,
    partialContent: "",
  });

  const sectionStart: StreamEvent = {
    type: "section_start",
    sectionId: section.id,
    chapterId: chapter.id,
    chapterNumber: chapter.number,
    chapterTitle: chapter.title,
    sectionNumber: section.number,
    sectionTitle: section.title,
  };
  emit(sectionStart);

  await db.chapter.update({
    where: { id: chapter.id },
    data: { status: "GENERATING" },
  });
  await db.book.update({
    where: { id: book.id },
    data: {
      status: "GENERATING",
      // Seed progress so UI isn't stuck at 0 before the first draft persist.
      progress: Math.max(book.progress ?? 0, 5),
    },
  });
  emit({
    type: "progress",
    progress: Math.max(book.progress ?? 0, 5),
    currentPages: book.currentPages ?? 0,
    targetPages: book.targetPages,
    status: "GENERATING",
  });

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
        if (!force && now - lastPersist < 8000) {
          break;
        }
        lastPersist = now;
        try {
          // Job payload only during stream — avoids stacking section + progress writes.
          await updateJobProgress(jobId, {
            currentSectionId: section.id,
            partialContent: snapshot,
          });
          // Persist book.progress so dashboard / jobs widget update without a full refresh.
          const result = await applyBookProgress(book.id, {
            activeSectionId: section.id,
            draftWordCount: countWords(snapshot),
            targetSectionWords: targetWords,
            wordsPerPage,
          });
          if (result) {
            emit({
              type: "progress",
              progress: result.progress,
              currentPages: result.currentPages,
              targetPages: result.targetPages,
              status: "GENERATING",
            });
          }
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

  const model = book.model || DEFAULT_AI_MODEL;
  const call: LlmCall = async (messages, options) => {
    // A second call while text is on screen is a continuation pass.
    if (draftContent) {
      const separator = endsCleanly(draftContent) ? "\n\n" : " ";
      draftContent += separator;
      emit({ type: "token", sectionId: section.id, text: separator });
    }
    const result = await streamChatCompletionDetailed({
      model,
      messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      onToken: (text) => {
        if (!text) return;
        draftContent += text;
        emit({ type: "token", sectionId: section.id, text });

        if (Date.now() - lastPersist >= 8000) {
          void persistDraft(draftContent);
        }
      },
    });
    // Let any in-flight draft write finish before the final section write.
    await (persistInFlight as Promise<void> | null)?.catch(() => undefined);
    return result;
  };

  const result = await writeSection(sectionId, {
    call,
    onRevisionStart: () => {
      // The revision replaces the streamed draft, so restart the live view.
      draftContent = "";
      emit(sectionStart);
    },
  });

  await updateJobProgress(jobId, {
    currentSectionId: section.id,
    partialContent: result.content,
  });

  emit({
    type: "section_done",
    sectionId: section.id,
    chapterId: chapter.id,
    wordCount: result.wordCount,
    pageCount: result.pageCount,
  });
  if (result.progress) {
    emit({
      type: "progress",
      progress: result.progress.progress,
      currentPages: result.progress.currentPages,
      targetPages: result.progress.targetPages,
      status: result.progress.allDone ? "COMPLETED" : "GENERATING",
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
  let lastPushMilestone = 0;

  try {
    const book = await db.book.findUniqueOrThrow({
      where: { id: bookId },
    });

    await throwIfCancelled(bookId);

    // Avoid re-spamming "started" on resume mid-book.
    if ((book.progress ?? 0) <= 2) {
      void notifyBookProgress({
        userId,
        bookId,
        title: book.title,
        progress: book.progress ?? 0,
        phase: "started",
      });
    }

    // Cover ASAP from title/description — do not wait for outline or prose.
    {
      const coverStatus = await db.book.findUnique({
        where: { id: bookId },
        select: { coverImage: true },
      });
      if (!coverStatus?.coverImage) {
        publisher({
          type: "phase",
          phase: "cover",
          message: "Generating cover…",
        });
        void generateAndSaveBookCover(bookId)
          .then(({ coverImage }) => {
            publisher({ type: "cover_ready", coverImage });
          })
          .catch((error) => {
            console.error(`Cover generation failed for book ${bookId}:`, error);
          });
      }
    }

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
      void notifyBookProgress({
        userId,
        bookId,
        title: book.title,
        progress: 5,
        phase: "outline",
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
            select: { progress: true, title: true },
          });
          if (pageCheck) {
            const milestone = nextPushMilestone(
              lastPushMilestone,
              pageCheck.progress ?? 0
            );
            if (milestone != null) {
              lastPushMilestone = milestone;
              void notifyBookProgress({
                userId,
                bookId,
                title: pageCheck.title,
                progress: milestone,
                phase: "progress",
              });
            }
          }
        }
      }
    }

    if (await hasIncompleteSections(bookId)) {
      const msg =
        "Generation finished early with incomplete sections. Tap Resume to continue.";
      await db.generationJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          error: msg,
          completedAt: new Date(),
          payload: {},
        },
      });
      await db.book.update({
        where: { id: bookId },
        data: {
          status: "FAILED",
          errorMessage: msg,
        },
      });
      publisher({ type: "error", message: msg });
      void notifyBookProgress({
        userId,
        bookId,
        title: refreshed.title,
        progress: refreshed.progress ?? 0,
        phase: "failed",
      });
      return;
    }

    await db.generationJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        payload: {},
      },
    });
    await db.book.update({
      where: { id: bookId },
      data: {
        status: "COMPLETED",
        progress: 100,
        completedAt: new Date(),
      },
    });
    publisher({ type: "done" });

    const finished = await db.book.findUnique({
      where: { id: bookId },
      select: {
        coverImage: true,
        userId: true,
        title: true,
        generateAudiobookOnComplete: true,
      },
    });

    if (finished) {
      void notifyBookProgress({
        userId: finished.userId,
        bookId,
        title: finished.title,
        progress: 100,
        phase: "completed",
      });
    }

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
    const failedBook = await db.book.findUnique({
      where: { id: bookId },
      select: { title: true },
    });
    void notifyBookProgress({
      userId,
      bookId,
      title: failedBook?.title ?? "Your book",
      progress: 0,
      phase: "failed",
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
