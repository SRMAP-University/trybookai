import type { Env, GenerationParams } from "../env";
import { withSql, type Sql } from "./db";

const STALE_RUNNING_MS = 15 * 60 * 1000;
const STALE_QUEUED_MS = 10 * 60 * 1000;

export type WorkerSweepResult = {
  staleRunningRequeued: number;
  staleRunningFailed: number;
  staleQueuedReenqueued: number;
  orphanBooksFailed: number;
  forceStarted: number;
  errors: string[];
};

type StaleJob = {
  id: string;
  bookId: string;
  userId: string;
  attempts: number;
  maxAttempts: number;
};

async function failJobAndBook(sql: Sql, jobId: string, bookId: string, error: string) {
  await sql`
    UPDATE "GenerationJob"
    SET
      status = 'FAILED',
      error = ${error.slice(0, 2000)},
      "completedAt" = NOW(),
      "updatedAt" = NOW()
    WHERE id = ${jobId}
  `;
  await sql`
    UPDATE "Book"
    SET
      status = 'FAILED',
      "errorMessage" = ${error.slice(0, 2000)},
      "updatedAt" = NOW()
    WHERE id = ${bookId}
      AND status <> 'PAUSED'
      AND status <> 'COMPLETED'
  `;
}

/**
 * Recover stale RUNNING/QUEUED jobs and orphan GENERATING books.
 * Invoked by the worker cron trigger every 5 minutes.
 */
export async function sweepStaleJobs(
  env: Env,
  startWorkflow: (
    env: Env,
    params: GenerationParams
  ) => Promise<{ restarted: boolean }>
): Promise<WorkerSweepResult> {
  const result: WorkerSweepResult = {
    staleRunningRequeued: 0,
    staleRunningFailed: 0,
    staleQueuedReenqueued: 0,
    orphanBooksFailed: 0,
    forceStarted: 0,
    errors: [],
  };

  const staleRunningBefore = new Date(Date.now() - STALE_RUNNING_MS);
  const staleQueuedBefore = new Date(Date.now() - STALE_QUEUED_MS);

  await withSql(env, async (sql) => {
    const staleRunning = await sql<StaleJob[]>`
      SELECT j.id, j."bookId", b."userId", j.attempts, j."maxAttempts"
      FROM "GenerationJob" j
      INNER JOIN "Book" b ON b.id = j."bookId"
      WHERE j.status = 'RUNNING'
        AND j."updatedAt" < ${staleRunningBefore}
      ORDER BY j."updatedAt" ASC
      LIMIT 50
    `;

    for (const job of staleRunning) {
      try {
        if (job.attempts >= job.maxAttempts) {
          await failJobAndBook(
            sql,
            job.id,
            job.bookId,
            `Generation stalled after ${job.attempts} attempts. Please resume to try again.`
          );
          result.staleRunningFailed++;
          continue;
        }

        await sql`
          UPDATE "GenerationJob"
          SET
            status = 'QUEUED',
            error = 'Stale RUNNING job — re-queued for worker',
            "startedAt" = NULL,
            "updatedAt" = NOW()
          WHERE id = ${job.id}
        `;
        result.staleRunningRequeued++;

        await startWorkflow(env, {
          bookId: job.bookId,
          userId: job.userId,
          jobId: job.id,
          force: true,
        });
        result.forceStarted++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`staleRunning ${job.id}: ${message.slice(0, 200)}`);
      }
    }

    const staleQueued = await sql<StaleJob[]>`
      SELECT j.id, j."bookId", b."userId", j.attempts, j."maxAttempts"
      FROM "GenerationJob" j
      INNER JOIN "Book" b ON b.id = j."bookId"
      WHERE j.status = 'QUEUED'
        AND j."updatedAt" < ${staleQueuedBefore}
      ORDER BY j."updatedAt" ASC
      LIMIT 50
    `;

    for (const job of staleQueued) {
      try {
        if (job.attempts >= job.maxAttempts) {
          await failJobAndBook(
            sql,
            job.id,
            job.bookId,
            `Generation failed after ${job.attempts} attempts. Please resume to try again.`
          );
          result.staleRunningFailed++;
          continue;
        }

        await startWorkflow(env, {
          bookId: job.bookId,
          userId: job.userId,
          jobId: job.id,
          force: true,
        });
        result.staleQueuedReenqueued++;
        result.forceStarted++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`staleQueued ${job.id}: ${message.slice(0, 200)}`);
      }
    }

    const orphans = await sql<{ id: string }[]>`
      SELECT b.id
      FROM "Book" b
      WHERE b.status IN ('GENERATING', 'OUTLINING')
        AND NOT EXISTS (
          SELECT 1 FROM "GenerationJob" j
          WHERE j."bookId" = b.id
            AND j.status IN ('QUEUED', 'RUNNING')
        )
      LIMIT 40
    `;

    for (const book of orphans) {
      try {
        await sql`
          UPDATE "Book"
          SET
            status = 'FAILED',
            "errorMessage" = 'Generation stopped unexpectedly. Tap Resume to continue.',
            "updatedAt" = NOW()
          WHERE id = ${book.id}
        `;
        result.orphanBooksFailed++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`orphanBook ${book.id}: ${message.slice(0, 200)}`);
      }
    }
  });

  return result;
}
