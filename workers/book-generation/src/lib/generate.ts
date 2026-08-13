import type { Env } from "../env";
import type { Sql } from "./db";
import {
  extractJsonPayload,
  OUTLINE_CF_MODEL,
  resolveCfModel,
  runAi,
  stripThinking,
} from "./ai";
import { ensureBookCover } from "./cover";
import { notifyApp } from "./notify";
import { resolveGenerationShape } from "./shape";
import { assembleSectionContext } from "./context-assembler";
import { seedBibleFromOutline } from "./context-seed";
import {
  extractAndUpdateCanon,
  hasIncompleteSections,
  refreshChapterCanon,
} from "./context-extract";

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
  await sql`
    UPDATE "GenerationJob"
    SET
      payload = ${sql.json(payload as never)},
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
      "generateAudiobookOnComplete"
    FROM "Book"
    WHERE id = ${bookId}
    LIMIT 1
  `;
  if (!rows[0]) throw new Error(`Book ${bookId} not found`);
  return rows[0];
}

function buildStyleBlock(book: BookRow): string {
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
    parts.push(`Characters / cast: ${JSON.stringify(book.characters)}`);
  if (book.themes) parts.push(`Themes: ${JSON.stringify(book.themes)}`);
  if (book.forbiddenTopics)
    parts.push(`Avoid these topics: ${book.forbiddenTopics}`);
  return parts.join("\n");
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

  const styleBlock = buildStyleBlock(book);
  const outlineTokens = Math.min(
    8192,
    400 + chapterCount * sectionsPerChapter * 100
  );

  const raw = await withAiHeartbeat(
    sql,
    jobId,
    "outlining_ai",
    { chapterCount, sectionsPerChapter },
    () =>
      runAi(
        ai,
        OUTLINE_CF_MODEL,
        [
          {
            role: "system",
            content: `You are an expert book architect. Create book outlines with exactly ${chapterCount} chapters, each with exactly ${sectionsPerChapter} sections. Return JSON with: title, synopsis, chapters[{number, title, summary, sections[{number, title, summary}]}]. Write all titles and summaries in the requested language. Keep summaries to 1–2 sentences each — concise for a ${book.targetPages}-page book.`,
          },
          {
            role: "user",
            content: `Create an outline for a ${book.targetPages}-page ${book.genre ?? "general"} book titled "${book.title}".
${book.description ? `Description: ${book.description}` : ""}

Writing requirements:
${styleBlock}`,
          },
        ],
        { max_tokens: outlineTokens, temperature: 0.5 }
      )
  );

  let outline: {
    title?: string;
    synopsis?: string;
    chapters: Array<{
      number?: number;
      title?: string;
      summary?: string;
      sections?: Array<{ number?: number; title?: string; summary?: string }>;
    }>;
  };
  try {
    outline = JSON.parse(extractJsonPayload(raw)) as typeof outline;
  } catch {
    const retry = await runAi(
      ai,
      OUTLINE_CF_MODEL,
      [
        {
          role: "system",
          content:
            "Return ONLY valid JSON for a book outline. No prose before or after. Schema: {title, synopsis, chapters:[{number,title,summary,sections:[{number,title,summary}]}]}",
        },
        {
          role: "user",
          content: `Fix this into valid JSON outline with exactly ${chapterCount} chapters and ${sectionsPerChapter} sections each:\n${raw.slice(0, 6000)}`,
        },
      ],
      { max_tokens: outlineTokens, temperature: 0.2 }
    );
    outline = JSON.parse(extractJsonPayload(retry)) as typeof outline;
  }

  const normalizedChapters = (outline.chapters ?? []).map(
    (chapter, chapterIndex) => ({
      number: chapterIndex + 1,
      title: chapter.title ?? `Chapter ${chapterIndex + 1}`,
      summary: chapter.summary ?? "",
      sections: (chapter.sections ?? []).map((section, sectionIndex) => ({
        number: sectionIndex + 1,
        title: section.title ?? `Section ${sectionIndex + 1}`,
        summary: section.summary ?? "",
      })),
    })
  );

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
        outline = ${tx.json({ ...outline, chapters: normalizedChapters })},
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
): Promise<Array<{ id: string; title: string }>> {
  const rows = await sql<{ id: string; title: string }[]>`
    SELECT s.id, s.title
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
  const allDone =
    (sections.length > 0 && completed.length === sections.length) ||
    (book[0].targetPages > 0 && currentPages >= book[0].targetPages);

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
      number: number;
      title: string;
      content: string | null;
      wordCount: number;
      chapterId: string;
      chapterNumber: number;
      chapterTitle: string;
      chapterSummary: string | null;
    }[]
  >`
    SELECT
      s.id, s.number, s.title, s.content, s."wordCount",
      c.id AS "chapterId", c.number AS "chapterNumber", c.title AS "chapterTitle",
      c.summary AS "chapterSummary"
    FROM "Section" s
    INNER JOIN "Chapter" c ON c.id = s."chapterId"
    WHERE s.id = ${sectionId}
    LIMIT 1
  `;
  const section = sectionRows[0];
  if (!section) throw new Error(`Section ${sectionId} not found`);
  if (section.wordCount > 0 && section.content) {
    return { skipped: true as const };
  }

  const book = await getBook(sql, bookId);
  const shape = resolveGenerationShape(book);
  const { sectionsPerChapter, wordsPerPage, pagesPerSection } = shape;
  const targetWords = pagesPerSection * wordsPerPage;

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

  let assembled;
  try {
    assembled = await assembleSectionContext(sql, bookId, sectionId);
  } catch (error) {
    console.warn(
      `[section] context assemble failed, using fallback:`,
      error instanceof Error ? error.message : error
    );
    assembled = null;
  }

  const fallbackStyle = [
    `Point of view: ${book.pov}`,
    `Tense: ${book.tense}`,
    `Language: ${book.language}`,
    `Tone: ${book.tone ?? "professional"}`,
    book.style ? `Style guide: ${book.style}` : null,
    book.customInstructions
      ? `Custom instructions: ${book.customInstructions}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const systemContent = `You are a professional author writing "${book.title}", a ${book.genre} book. Write approximately ${targetWords} words (~${pagesPerSection} pages). Maintain narrative consistency with the CORE/CURRENT/RETRIEVED context. Output only the final section prose — no headings, no reasoning, and no thinking notes.

Writing requirements:
${assembled?.systemStyle ?? fallbackStyle}`;

  const userContent =
    assembled?.userPrompt ??
    `Book synopsis: ${(book.outline as { synopsis?: string } | null)?.synopsis ?? book.description ?? ""}

Current chapter: "${section.chapterTitle}" - ${section.chapterSummary ?? ""}

Write section "${section.title}" (Section ${section.number} of ${sectionsPerChapter}).`;

  let raw = await withAiHeartbeat(
    sql,
    jobId,
    "writing_ai",
    { currentSectionId: sectionId, sectionTitle: section.title },
    () =>
      runAi(
        ai,
        resolveCfModel(book.model),
        [
          { role: "system", content: systemContent },
          { role: "user", content: userContent },
        ],
        {
          max_tokens: Math.min(8192, Math.max(2048, targetWords * 2)),
          temperature: book.creativity ?? 0.7,
        }
      )
  );

  await assertNotPaused(sql, bookId);

  let content = stripThinking(raw);
  let extractResult: Awaited<ReturnType<typeof extractAndUpdateCanon>> | null =
    null;
  try {
    extractResult = await extractAndUpdateCanon(sql, ai, {
      bookId,
      chapterId: section.chapterId,
      sectionId,
      sectionTitle: section.title,
      content,
      existingFactsBrief: assembled?.factsBrief,
    });
  } catch (error) {
    console.warn(
      `[section] extract canon failed:`,
      error instanceof Error ? error.message : error
    );
  }

  // One-shot consistency revise if contradictions found.
  if (extractResult?.contradictions?.length) {
    const note = extractResult.contradictions.join("; ");
    try {
      raw = await runAi(
        ai,
        resolveCfModel(book.model),
        [
          { role: "system", content: systemContent },
          {
            role: "user",
            content: `${userContent}

CONSISTENCY FIX REQUIRED — revise the scene to resolve:
${note}

Previous draft:
${content.slice(0, 4000)}`,
          },
        ],
        {
          max_tokens: Math.min(8192, Math.max(2048, targetWords * 2)),
          temperature: Math.min(0.5, book.creativity ?? 0.5),
        }
      );
      content = stripThinking(raw);
      await extractAndUpdateCanon(sql, ai, {
        bookId,
        chapterId: section.chapterId,
        sectionId,
        sectionTitle: section.title,
        content,
        existingFactsBrief: assembled?.factsBrief,
      }).catch(() => undefined);
    } catch (error) {
      console.warn(
        `[section] consistency revise failed:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const pageCount = Math.min(
    pagesPerSection,
    Math.max(1, Math.ceil(wordCount / wordsPerPage))
  );

  await sql`
    UPDATE "Section"
    SET content = ${content}, "wordCount" = ${wordCount}, "pageCount" = ${pageCount}, "updatedAt" = NOW()
    WHERE id = ${sectionId}
  `;

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
    await refreshChapterCanon(sql, bookId, section.chapterId).catch((error) => {
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
