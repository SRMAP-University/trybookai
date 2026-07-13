import { db } from "@/lib/db";
import { isGenerationActive } from "@/lib/book-generator/background";
import { subscribeBookEvents } from "@/lib/book-generator/events";
import { computeBookProgress } from "@/lib/book-generator/progress";
import { resolveGenerationShape } from "@/lib/book-generator/shape";
import type { StreamEmitter } from "@/lib/book-generator/streaming";

const POLL_MS = 500;

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

type JobPayload = {
  currentSectionId?: string;
  partialContent?: string;
};

type BookSnapshot = {
  status: string;
  errorMessage: string | null;
  outline: unknown;
  targetPages: number;
  chapterCount: number | null;
  wordsPerPage: number;
  sectionsPerChapter: number;
  chapters: {
    id: string;
    number: number;
    title: string;
    sections: {
      id: string;
      number: number;
      title: string;
      content: string | null;
      wordCount: number;
      pageCount: number;
    }[];
  }[];
  generationJobs: { payload: unknown }[];
};

async function loadBook(bookId: string) {
  return db.book.findUnique({
    where: { id: bookId },
    include: {
      chapters: {
        orderBy: { number: "asc" },
        include: { sections: { orderBy: { number: "asc" } } },
      },
      generationJobs: {
        where: { status: "RUNNING" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  }) as Promise<BookSnapshot | null>;
}

function findActiveSection(book: BookSnapshot, currentSectionId?: string) {
  let activeChapter: BookSnapshot["chapters"][number] | null = null;
  let activeSection: BookSnapshot["chapters"][number]["sections"][number] | null =
    null;

  if (currentSectionId) {
    for (const chapter of book.chapters) {
      const section = chapter.sections.find((s) => s.id === currentSectionId);
      if (section) {
        activeChapter = chapter;
        activeSection = section;
        break;
      }
    }
  }

  if (!activeSection) {
    for (const chapter of book.chapters) {
      for (const section of chapter.sections) {
        if (section.wordCount === 0) {
          activeChapter = chapter;
          activeSection = section;
          break;
        }
      }
      if (activeSection) break;
    }
  }

  return { activeChapter, activeSection };
}

export async function watchGenerationStream(
  bookId: string,
  userId: string,
  emit: StreamEmitter,
  signal?: AbortSignal
) {
  await db.book.findFirstOrThrow({
    where: { id: bookId, userId },
  });

  let lastSectionId: string | null = null;
  let lastContentLength = 0;
  let lastProgress = -1;
  let lastCurrentPages = -1;
  let outlineEmitted = false;
  let doneEmitted = false;

  const syncDraftFromDb = (book: BookSnapshot) => {
    const job = book.generationJobs[0];
    const payload = (job?.payload ?? {}) as JobPayload;
    const currentSectionId = payload.currentSectionId;
    const { activeChapter, activeSection } = findActiveSection(
      book,
      currentSectionId
    );

    if (!activeSection || !activeChapter) return;

    if (activeSection.id !== lastSectionId) {
      lastSectionId = activeSection.id;
      lastContentLength = 0;
      emit({
        type: "section_start",
        sectionId: activeSection.id,
        chapterId: activeChapter.id,
        chapterNumber: activeChapter.number,
        chapterTitle: activeChapter.title,
        sectionNumber: activeSection.number,
        sectionTitle: activeSection.title,
      });
    }

    const liveContent =
      activeSection.id === currentSectionId
        ? (payload.partialContent ?? activeSection.content ?? "")
        : (activeSection.content ?? "");

    if (liveContent.length > lastContentLength) {
      emit({
        type: "token",
        sectionId: activeSection.id,
        text: liveContent.slice(lastContentLength),
      });
      lastContentLength = liveContent.length;
    } else if (
      liveContent.length === 0 &&
      activeSection.id === currentSectionId
    ) {
      emit({
        type: "phase",
        phase: "writing",
        message: "Composing draft…",
      });
    }
  };

  const unsubscribe = subscribeBookEvents(bookId, (event) => {
    if (event.type === "section_start" && event.sectionId !== lastSectionId) {
      lastSectionId = event.sectionId;
      lastContentLength = 0;
    }
    if (event.type === "token") {
      lastContentLength += event.text.length;
    }
    if (event.type === "outline_ready") {
      outlineEmitted = true;
    }
    if (event.type === "done") {
      doneEmitted = true;
    }
    emit(event);
  });

  try {
    const initial = await loadBook(bookId);
    if (initial) {
      syncDraftFromDb(initial);
    }

    while (!signal?.aborted) {
      const book = await loadBook(bookId);
      if (!book) break;

      const job = book.generationJobs[0];
      const payload = (job?.payload ?? {}) as JobPayload;
      const currentSectionId = payload.currentSectionId;
      const generationActive = isGenerationActive(bookId) || !!job;

      if (
        !book.outline &&
        book.status !== "COMPLETED" &&
        book.status !== "FAILED"
      ) {
        emit({
          type: "phase",
          phase: "outlining",
          message: "Building outline…",
        });
      } else if (!outlineEmitted && book.outline) {
        outlineEmitted = true;
        emit({ type: "outline_ready", chapterCount: book.chapters.length });
        emit({
          type: "phase",
          phase: "writing",
          message: "Writing your book…",
        });
      }

      if (!generationActive) {
        syncDraftFromDb(book);
      }

      const draftWordCount = payload.partialContent
        ? payload.partialContent.split(/\s+/).filter(Boolean).length
        : 0;
      const shape = resolveGenerationShape(book);
      const { wordsPerPage, pagesPerSection } = shape;
      const targetSectionWords = pagesPerSection * wordsPerPage;

      const computed = await computeBookProgress(bookId, {
        activeSectionId: currentSectionId,
        draftWordCount,
        targetSectionWords,
        wordsPerPage,
      });

      if (
        computed.progress !== lastProgress ||
        computed.currentPages !== lastCurrentPages
      ) {
        lastProgress = computed.progress;
        lastCurrentPages = computed.currentPages;
        emit({
          type: "progress",
          progress: computed.progress,
          currentPages: computed.currentPages,
          targetPages: computed.targetPages,
          status: computed.allDone ? "COMPLETED" : book.status,
        });
      }

      if ((book.status === "COMPLETED" || computed.allDone) && !doneEmitted) {
        doneEmitted = true;
        emit({ type: "done" });
        break;
      }

      if (book.status === "FAILED") {
        emit({
          type: "error",
          message: book.errorMessage ?? "Generation failed",
        });
        break;
      }

      if (
        !generationActive &&
        !job &&
        book.chapters.length > 0 &&
        book.chapters.every((c) => c.sections.every((s) => s.wordCount > 0))
      ) {
        if (!doneEmitted) {
          doneEmitted = true;
          emit({ type: "done" });
        }
        break;
      }

      try {
        await sleep(POLL_MS, signal);
      } catch {
        break;
      }
    }
  } finally {
    unsubscribe();
  }
}
