import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import type { Env, GenerationParams } from "./env";
import { withSql } from "./lib/db";
import { ensureBookCover } from "./lib/cover";
import {
  claimJob,
  failJob,
  finalizeJob,
  generateOutlineStep,
  GenerationPausedError,
  listPendingSections,
  writeSectionStep,
} from "./lib/generate";

/** Chapters drafted at once after chapter 1. */
const CHAPTER_LANES = 4;

function isPausedError(error: unknown): boolean {
  if (error instanceof GenerationPausedError) return true;
  const name = (error as { name?: string } | null)?.name;
  if (name === "GenerationPausedError") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /Generation cancelled|Generation is paused|paused/i.test(message);
}

export class BookGenerationWorkflow extends WorkflowEntrypoint<
  Env,
  GenerationParams
> {
  async run(event: WorkflowEvent<GenerationParams>, step: WorkflowStep) {
    const { bookId, userId, jobId } = event.payload;

    try {
      await step.do(
        "claim",
        { retries: { limit: 3, delay: "5 seconds", backoff: "linear" } },
        async () => {
          await withSql(this.env, async (sql) => {
            await claimJob(sql, this.env, jobId, bookId);
          });
          return { ok: true };
        }
      );

      // Cover starts with outline (title/description) — not after the manuscript.
      await Promise.all([
        step.do(
          "outline",
          {
            retries: { limit: 2, delay: "10 seconds", backoff: "linear" },
            // Large books plan section batches after the chapter arc.
            timeout: "15 minutes",
          },
          async () => {
            return withSql(this.env, async (sql) =>
              generateOutlineStep(sql, this.env.AI, this.env, bookId, jobId)
            );
          }
        ),
        step.do("cover", async () => {
          return withSql(this.env, async (sql) => {
            const result = await ensureBookCover(sql, this.env, bookId);
            if (result.error) {
              console.warn(
                `[workflow] cover failed for ${bookId}:`,
                result.error
              );
            }
            return result;
          });
        }),
      ]);

      const sections = await step.do("list-sections", async () => {
        return withSql(this.env, async (sql) =>
          listPendingSections(sql, bookId)
        );
      });

      // Sections run in order within a chapter (each continues the last).
      const chapters = new Map<number, typeof sections>();
      for (const section of sections) {
        const list = chapters.get(section.chapterNumber) ?? [];
        list.push(section);
        chapters.set(section.chapterNumber, list);
      }
      const queue = [...chapters.entries()]
        .sort(([a], [b]) => a - b)
        .map(([number, list]) => ({ number, list }));

      const writeChapter = async (list: typeof sections) => {
        for (const section of list) {
          await step.do(
            `section:${section.id}`,
            {
              retries: { limit: 2, delay: "15 seconds", backoff: "linear" },
              // Draft + continuation passes + continuity ledger can take several calls.
              timeout: "15 minutes",
            },
            async () => {
              return withSql(this.env, async (sql) =>
                writeSectionStep(
                  sql,
                  this.env.AI,
                  this.env,
                  bookId,
                  jobId,
                  section.id
                )
              );
            }
          );
        }
      };

      // Chapter 1 sets the voice, cast and terms the rest build on, so it is
      // written first; the remaining chapters are drafted in parallel lanes.
      if (queue[0]?.number === 1) await writeChapter(queue.shift()!.list);
      await Promise.all(
        Array.from({ length: Math.min(CHAPTER_LANES, queue.length) }, async () => {
          for (let next = queue.shift(); next; next = queue.shift()) {
            await writeChapter(next.list);
          }
        })
      );

      const final = await step.do("finalize", async () => {
        return withSql(this.env, async (sql) =>
          finalizeJob(sql, this.env, bookId, jobId)
        );
      });

      return { bookId, userId, jobId, ...final };
    } catch (error) {
      if (isPausedError(error)) {
        await step.do("mark-cancelled", async () => {
          await withSql(this.env, async (sql) => {
            await sql`
              UPDATE "GenerationJob"
              SET
                status = 'FAILED',
                error = 'Cancelled',
                "completedAt" = NOW(),
                "updatedAt" = NOW()
              WHERE id = ${jobId}
            `;
            await sql`
              UPDATE "Book"
              SET
                status = 'PAUSED',
                "errorMessage" = 'Generation stopped by user',
                "updatedAt" = NOW()
              WHERE id = ${bookId}
            `;
          });
          return { cancelled: true };
        });
        return { bookId, jobId, cancelled: true };
      }

      const message =
        error instanceof Error ? error.message : "Generation failed";
      await step.do("mark-failed", async () => {
        await withSql(this.env, async (sql) => {
          await failJob(sql, this.env, jobId, bookId, message);
        });
        return { failed: true };
      });
      throw error;
    }
  }
}
