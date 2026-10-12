import type { Env } from "../env";
import type { Sql } from "./db";
import { runGenerationAiDetailed } from "./ai";
import { ensureBookCover } from "./cover";
import { notifyApp } from "./notify";
import { resolveGenerationShape } from "./shape";
import { assembleSectionContext } from "./context-assembler";
import { seedBibleFromOutline } from "./context-seed";
import {
  applySectionUpdate,
  extractSectionUpdate,
  hasIncompleteSections,
  refreshChapterCanon,
} from "./context-extract";
import {
  buildStyleBlock,
  countWords,
  creditedSectionPages,
  draftSection,
  planBookOutline,
  reviseForContinuity,
  WORDS_PER_PAGE,
  type LlmCall,
  type SectionUpdate,
} from "../../../../src/lib/book-generator/core";

export class GenerationPausedError extends Error {
  constructor(message = "Generation cancelled") {
    super(message);
    this.name = "GenerationPausedError";
  }
}

type BookRow = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  genre: string | null;
  targetPages: number;
  currentPages: number;
  status: string;
  outline: unknown;
  style: string | null;
  audience: string | null;
  tone: string | null;
  progress: number;
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
  generateAudiobookOnComplete: boolean;
  templateId?: string | null;
};

export async function assertNotPaused(sql: Sql, bookId: string) {
  const rows = await sql<{ status: string }[]>`
    SELECT status FROM "Book" WHERE id = ${bookId} LIMIT 1
  `;
  if (rows[0]?.status === "PAUSED") {
    throw new GenerationPausedError();
  }
}

export async function heartbeatJob(
  sql: Sql,
  jobId: string,
  payload: Record<string, unknown>
) {
  // Merge, don't replace: lastPushMilestone must survive per-section heartbeats
  // (replacing it re-sent the 25% push after every section).
  await sql`
    UPDATE "GenerationJob"
    SET
      payload = COALESCE(payload, '{}'::jsonb) || ${sql.json(payload as never)}::jsonb,
      "updatedAt" = NOW()
    WHERE id = ${jobId}
  `;
}

/** Keep job lease alive while a long AI call is in flight. */
async function withAiHeartbeat<T>(
  sql: Sql,
  jobId: string,
  phase: string,
  meta: Record<string, unknown>,
  work: () => Promise<T>
): Promise<T> {
  const started = Date.now();
  const timer = setInterval(() => {
    void heartbeatJob(sql, jobId, {
      phase,
      ...meta,
      heartbeatAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
    }).catch(() => undefined);
  }, 60_000);
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}

export async function claimJob(
  sql: Sql,
  env: Env,
  jobId: string,
  bookId: string
) {
  await assertNotPaused(sql, bookId);

  const existing = await sql<
    { status: string; attempts: number; maxAttempts: number }[]
  >`
    SELECT status, attempts, "maxAttempts"
    FROM "GenerationJob" WHERE id = ${jobId} LIMIT 1
  `;
  if (!existing[0]) {
    throw new Error(`Job ${jobId} not found`);
  }
  if (existing[0].status === "COMPLETED") {
    return { alreadyDone: true as const };
  }
  if (existing[0].status === "FAILED") {
    // Cancel sets PAUSED first; assertNotPaused above covers that path.
    throw new Error(`Job ${jobId} already failed`);
  }
  if (existing[0].attempts >= existing[0].maxAttempts) {
    const err = `Generation failed after ${existing[0].attempts} attempts. Please resume to try again.`;
    await sql`
      UPDATE "GenerationJob"
      SET status = 'FAILED', error = ${err}, "completedAt" = NOW(), "updatedAt" = NOW()
      WHERE id = ${jobId}
    `;
    await sql`
      UPDATE "Book"
      SET status = 'FAILED', "errorMessage" = ${err}, "updatedAt" = NOW()
      WHERE id = ${bookId} AND status <> 'PAUSED' AND status <> 'COMPLETED'
    `;
    throw new Error(err);
  }

  const firstClaim = existing[0].attempts === 0;

  const claimed = await sql`
    UPDATE "GenerationJob"
    SET
      status = 'RUNNING',
      "startedAt" = COALESCE("startedAt", NOW()),
      "updatedAt" = NOW(),
      attempts = attempts + 1,
      error = NULL
    WHERE id = ${jobId} AND status IN ('QUEUED', 'RUNNING')
    RETURNING id
  `;
  if (claimed.length === 0) {
    throw new Error(`Job ${jobId} is not claimable`);
  }
  await sql`
    UPDATE "Book"
    SET status = 'GENERATING', "updatedAt" = NOW()
    WHERE id = ${bookId} AND status <> 'PAUSED' AND status <> 'COMPLETED'
  `;
  await heartbeatJob(sql, jobId, { phase: "claimed", at: new Date().toISOString() });

  if (firstClaim) {
    const book = await getBook(sql, bookId).catch(() => null);
    if (book) {
      void notifyApp(env, {
        userId: book.userId,
        bookId,
        phase: "started",
        progress: 0,
        title: book.title,
      });
    }
  }
}

async function getBook(sql: Sql, bookId: string): Promise<BookRow> {
  const rows = await sql<BookRow[]>`
    SELECT
      id, "userId", title, description, genre, "targetPages", "currentPages",
      status, outline, style, audience, tone, progress, pov, tense, language,
      "chapterCount", "sectionsPerChapter", "wordsPerPage",
      "includeDialogue", "includeExamples", "customInstructions",
      characters, themes, "forbiddenTopics", model, creativity,
      "generateAudiobookOnComplete", "templateId"
    FROM "Book"
    WHERE id = ${bookId}
    LIMIT 1
  `;
  if (!rows[0]) throw new Error(`Book ${bookId} not found`);
  return rows[0];
}

export async function generateOutlineStep(
  sql: Sql,
  ai: Ai,
  env: Env,
  bookId: string,
  jobId: string
) {
  await assertNotPaused(sql, bookId);
  const book = await getBook(sql, bookId);
  if (book.outline) {
    await heartbeatJob(sql, jobId, { phase: "outline_exists" });
    return { skipped: true as const };
  }

  const shape = resolveGenerationShape(book);
  const { chapterCount, sectionsPerChapter, wordsPerPage } = shape;

  await sql`
    UPDATE "Book"
    SET status = 'OUTLINING', progress = 2, "updatedAt" = NOW()
    WHERE id = ${bookId}
  `;
  await heartbeatJob(sql, jobId, {
    phase: "outlining",
    chapterCount,
    sectionsPerChapter,
  });

  const outline = await withAiHeartbeat(
    sql,
    jobId,
    "outlining_ai",
    { chapterCount, sectionsPerChapter },
    () =>
      planBookOutline(
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
        (messages, options) =>
          runGenerationAiDetailed(env, book.model, messages, options, "outline")
      )
  );
  const normalizedChapters = outline.chapters;

  const newId = () =>
    `c${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

  await sql.begin(async (tx) => {
    await tx`DELETE FROM "Chapter" WHERE "bookId" = ${bookId}`;
    for (const chapter of normalizedChapters) {
      const chapterId = newId();
      await tx`
        INSERT INTO "Chapter" (id, "bookId", number, title, summary, status, "createdAt", "updatedAt")
        VALUES (
          ${chapterId},
          ${bookId},
          ${chapter.number},
          ${chapter.title},
          ${chapter.summary},
          'PENDING',
          NOW(),
          NOW()
        )
      `;
      for (const section of chapter.sections) {
        await tx`
          INSERT INTO "Section" (id, "chapterId", number, title, "pageCount", "wordCount", "createdAt", "updatedAt")
          VALUES (
            ${newId()},
            ${chapterId},
            ${section.number},
            ${section.title},
            0,
            0,
            NOW(),
            NOW()
          )
        `;
      }
    }

    await tx`
      UPDATE "Book"
      SET
        outline = ${tx.json(outline as never)},
        status = 'GENERATING',
        progress = 5,
        "chapterCount" = ${chapterCount},
        "sectionsPerChapter" = ${sectionsPerChapter},
        "wordsPerPage" = ${wordsPerPage},
        "updatedAt" = NOW()
      WHERE id = ${bookId}
    `;
  });

  await heartbeatJob(sql, jobId, {
    phase: "outline_ready",
    chapterCount: normalizedChapters.length,
    lastPushMilestone: 0,
  });

  try {
    await seedBibleFromOutline(sql, bookId);
  } catch (error) {
    console.warn(
      `[outline] seed bible failed for ${bookId}:`,
      error instanceof Error ? error.message : error
    );
  }

  void notifyApp(env, {
    userId: book.userId,
    bookId,
    phase: "outline",
    progress: 5,
    title: book.title,
  });

  return { skipped: false as const, chapterCount: normalizedChapters.length };
}

export async function listPendingSections(
  sql: Sql,
  bookId: string
): Promise<Array<{ id: string; title: string; chapterNumber: number }>> {
  const rows = await sql<{ id: string; title: string; chapterNumber: number }[]>`
    SELECT s.id, s.title, c.number AS "chapterNumber"
    FROM "Section" s
    INNER JOIN "Chapter" c ON c.id = s."chapterId"
    WHERE c."bookId" = ${bookId}
      AND (s.content IS NULL OR s."wordCount" = 0)
    ORDER BY c.number ASC, s.number ASC
  `;
  return rows;
}

async function applyProgress(sql: Sql, bookId: string) {
  const book = await sql<
    { targetPages: number; wordsPerPage: number; progress: number; currentPages: number; status: string }[]
  >`
    SELECT "targetPages", "wordsPerPage", progress, "currentPages", status
    FROM "Book" WHERE id = ${bookId} LIMIT 1
  `;
  if (!book[0] || book[0].status === "PAUSED") return null;

  const sections = await sql<{ wordCount: number; pageCount: number }[]>`
    SELECT s."wordCount", s."pageCount"
    FROM "Section" s
    INNER JOIN "Chapter" c ON c.id = s."chapterId"
    WHERE c."bookId" = ${bookId}
  `;

  const completed = sections.filter((s) => s.wordCount > 0);
  const currentPages = completed.reduce((sum, s) => sum + s.pageCount, 0);
  const sectionProgress =
    sections.length === 0 ? 0 : completed.length / sections.length;
  const progress = Math.min(
    99,
    Math.max(
      book[0].progress,
      Math.round((5 + sectionProgress * 90) * 10) / 10
    )
  );
  // Only finished when every planned section is written. Stopping at the page
  // target used to skip the last sections and then fail the completeness check.
  const allDone = sections.length > 0 && completed.length === sections.length;

  if (allDone) {
    await sql`
      UPDATE "Book"
      SET
        "currentPages" = ${Math.max(currentPages, book[0].currentPages)},
        progress = 100,
        status = 'COMPLETED',
        "completedAt" = COALESCE("completedAt", NOW()),
        "updatedAt" = NOW()
      WHERE id = ${bookId} AND status <> 'PAUSED'
    `;
  } else {
    await sql`
      UPDATE "Book"
      SET
        "currentPages" = ${Math.max(currentPages, book[0].currentPages)},
        progress = ${progress},
        status = 'GENERATING',
        "updatedAt" = NOW()
      WHERE id = ${bookId} AND status <> 'PAUSED'
    `;
  }

  return { allDone, progress, currentPages };
}

export async function writeSectionStep(
  sql: Sql,
  ai: Ai,
  env: Env,
  bookId: string,
  jobId: string,
  sectionId: string
) {
  await assertNotPaused(sql, bookId);

  const sectionRows = await sql<
    {
      id: string;
      title: string;
      content: string | null;
      wordCount: number;
      chapterId: string;
    }[]
  >`
    SELECT id, title, content, "wordCount", "chapterId"
    FROM "Section"
    WHERE id = ${sectionId}
    LIMIT 1
  `;
  const section = sectionRows[0];
  if (!section) throw new Error(`Section ${sectionId} not found`);
  if (section.wordCount > 0 && section.content) {
    return { skipped: true as const };
  }

  const book = await getBook(sql, bookId);
  const wordsPerPage = book.wordsPerPage || WORDS_PER_PAGE;
  const temperature = book.creativity ?? 0.7;

  await sql`
    UPDATE "Chapter" SET status = 'GENERATING', "updatedAt" = NOW()
    WHERE id = ${section.chapterId}
  `;
  await sql`
    UPDATE "Book"
    SET status = 'GENERATING', progress = GREATEST(progress, 5), "updatedAt" = NOW()
    WHERE id = ${bookId} AND status <> 'PAUSED'
  `;
  await heartbeatJob(sql, jobId, {
    phase: "writing",
    currentSectionId: sectionId,
    sectionTitle: section.title,
  });

  const prompt = await assembleSectionContext(sql, bookId, sectionId);
  const titles = {
    sectionTitle: prompt.sectionTitle,
    chapterTitle: prompt.chapterTitle,
  };
  const call: LlmCall = (messages, options) =>
    withAiHeartbeat(
      sql,
      jobId,
      "writing_ai",
      { currentSectionId: sectionId, sectionTitle: section.title },
      () => runGenerationAiDetailed(env, book.model, messages, options, "prose")
    );

  const draft = await draftSection({
    messages: prompt.messages,
    targetWords: prompt.targetWords,
    language: book.language,
    temperature,
    titles,
    call,
  });

  await assertNotPaused(sql, bookId);

  const extract = (text: string) =>
    extractSectionUpdate(ai, {
      sectionTitle: section.title,
      content: text,
      knownFacts: prompt.factsBrief,
      openThreads: prompt.openThreads,
    }).catch((error) => {
      console.warn(
        `[section] extract canon failed:`,
        error instanceof Error ? error.message : error
      );
      return null;
    });

  let content = draft.content;
  let update: SectionUpdate | null = await extract(content);

  // One continuity revision when the ledger reports a conflict with canon.
  if (update?.contradictions.length) {
    const revised = await reviseForContinuity({
      messages: prompt.messages,
      draft: content,
      contradictions: update.contradictions,
      language: book.language,
      temperature,
      titles,
      call,
    }).catch((error) => {
      console.warn(
        `[section] consistency revise failed:`,
        error instanceof Error ? error.message : error
      );
      return null;
    });
    if (revised) {
      content = revised;
      update = (await extract(revised)) ?? update;
    }
  }

  const wordCount = countWords(content);
  const pageCount = creditedSectionPages(wordCount, wordsPerPage, prompt.pageBudget);

  await sql`
    UPDATE "Section"
    SET content = ${content}, "wordCount" = ${wordCount}, "pageCount" = ${pageCount}, "updatedAt" = NOW()
    WHERE id = ${sectionId}
  `;

  if (update) {
    await applySectionUpdate(
      sql,
      { bookId, chapterId: section.chapterId, sectionId },
      update
    ).catch((error) => {
      console.warn(
        `[section] save canon failed:`,
        error instanceof Error ? error.message : error
      );
    });
  }

  const chapterSections = await sql<{ id: string; wordCount: number }[]>`
    SELECT id, "wordCount" FROM "Section" WHERE "chapterId" = ${section.chapterId}
  `;
  const chapterComplete = chapterSections.every(
    (s) => s.id === sectionId || s.wordCount > 0
  );
  if (chapterComplete) {
    const chapterPages = await sql<{ sum: number }[]>`
      SELECT COALESCE(SUM("pageCount"), 0)::int AS sum
      FROM "Section" WHERE "chapterId" = ${section.chapterId}
    `;
    await sql`
      UPDATE "Chapter"
      SET
        status = 'COMPLETED',
        "pageCount" = ${chapterPages[0]?.sum ?? pageCount},
        "updatedAt" = NOW()
      WHERE id = ${section.chapterId}
    `;
    await refreshChapterCanon(sql, ai, bookId, section.chapterId).catch((error) => {
      console.warn(
        `[section] refresh chapter canon failed:`,
        error instanceof Error ? error.message : error
      );
    });
  }

  await sql`
    UPDATE "User"
    SET "pagesUsed" = "pagesUsed" + ${pageCount}
    WHERE id = ${book.userId}
  `;

  const progress = await applyProgress(sql, bookId);

  const jobRows = await sql<{ payload: unknown }[]>`
    SELECT payload FROM "GenerationJob" WHERE id = ${jobId} LIMIT 1
  `;
  const prevPayload =
    (jobRows[0]?.payload as { lastPushMilestone?: number } | null) ?? {};
  const lastMilestone = prevPayload.lastPushMilestone ?? 0;

  let nextMilestone = lastMilestone;
  if (progress && !progress.allDone) {
    const notified = await notifyApp(env, {
      userId: book.userId,
      bookId,
      phase: "progress",
      progress: progress.progress,
      title: book.title,
      lastMilestone,
    });
    if (typeof notified?.milestone === "number") {
      nextMilestone = notified.milestone;
    }
  }

  await heartbeatJob(sql, jobId, {
    phase: "section_done",
    currentSectionId: sectionId,
    wordCount,
    pageCount,
    progress: progress?.progress ?? null,
    lastPushMilestone: nextMilestone,
  });

  return {
    skipped: false as const,
    wordCount,
    pageCount,
    allDone: progress?.allDone ?? false,
  };
}

export async function finalizeJob(
  sql: Sql,
  env: Env,
  bookId: string,
  jobId: string
) {
  const book = await getBook(sql, bookId);
  if (book.status === "PAUSED") {
    await sql`
      UPDATE "GenerationJob"
      SET status = 'FAILED', error = 'Cancelled', "completedAt" = NOW(), "updatedAt" = NOW()
      WHERE id = ${jobId}
    `;
    return { cancelled: true as const };
  }

  await applyProgress(sql, bookId);

  if (await hasIncompleteSections(sql, bookId)) {
    const msg =
      "Generation finished early with incomplete sections. Tap Resume to continue.";
    await sql`
      UPDATE "GenerationJob"
      SET status = 'FAILED', error = ${msg}, "completedAt" = NOW(), "updatedAt" = NOW()
      WHERE id = ${jobId}
    `;
    await sql`
      UPDATE "Book"
      SET status = 'FAILED', "errorMessage" = ${msg}, "updatedAt" = NOW()
      WHERE id = ${bookId} AND status <> 'PAUSED'
    `;
    void notifyApp(env, {
      userId: book.userId,
      bookId,
      phase: "failed",
      title: book.title,
    });
    return { cancelled: false as const, incomplete: true as const };
  }

  await sql`
    UPDATE "Book"
    SET status = 'COMPLETED', progress = 100, "completedAt" = COALESCE("completedAt", NOW()), "updatedAt" = NOW()
    WHERE id = ${bookId} AND status <> 'PAUSED'
  `;
  await sql`
    UPDATE "GenerationJob"
    SET status = 'COMPLETED', payload = ${sql.json({ phase: "done" })}, "completedAt" = NOW(), "updatedAt" = NOW()
    WHERE id = ${jobId}
  `;

  void notifyApp(env, {
    userId: book.userId,
    bookId,
    phase: "completed",
    progress: 100,
    title: book.title,
  });

  // Backstop: cover may have failed earlier without blocking writing.
  const cover = await ensureBookCover(sql, env, bookId).catch((error) => {
    console.warn(
      `[finalize] cover backstop failed for ${bookId}:`,
      error instanceof Error ? error.message : error
    );
    return { coverImage: null as string | null };
  });

  return {
    cancelled: false as const,
    generateAudiobookOnComplete: book.generateAudiobookOnComplete,
    coverImage: cover.coverImage,
  };
}

export async function failJob(
  sql: Sql,
  env: Env,
  jobId: string,
  bookId: string,
  error: string
) {
  const book = await getBook(sql, bookId).catch(() => null);
  await sql`
    UPDATE "GenerationJob"
    SET status = 'FAILED', error = ${error.slice(0, 2000)}, "completedAt" = NOW(), "updatedAt" = NOW()
    WHERE id = ${jobId}
  `;
  await sql`
    UPDATE "Book"
    SET status = 'FAILED', "errorMessage" = ${error.slice(0, 2000)}, "updatedAt" = NOW()
    WHERE id = ${bookId} AND status <> 'PAUSED' AND status <> 'COMPLETED'
  `;
  if (book) {
    void notifyApp(env, {
      userId: book.userId,
      bookId,
      phase: "failed",
      title: book.title,
    });
  }
}
