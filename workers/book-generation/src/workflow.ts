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

      await step.do(
        "outline",
        { retries: { limit: 2, delay: "10 seconds", backoff: "linear" } },
        async () => {
          return withSql(this.env, async (sql) =>
            generateOutlineStep(sql, this.env.AI, this.env, bookId, jobId)
          );
        }
      );

      // Cover runs on the Next.js app (R2 + image models). Never throw — a
      // missing cover must not abort prose; finalize retries if still empty.
      await step.do("cover", async () => {
        return withSql(this.env, async (sql) => {
          const result = await ensureBookCover(sql, this.env, bookId);
          if (result.error) {
            console.warn(`[workflow] cover failed for ${bookId}:`, result.error);
          }
          return result;
        });
      });

      const sections = await step.do("list-sections", async () => {
        return withSql(this.env, async (sql) =>
          listPendingSections(sql, bookId)
        );
      });

      for (const section of sections) {
        const result = await step.do(
          `section:${section.id}`,
          { retries: { limit: 2, delay: "15 seconds", backoff: "linear" } },
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
        if (result && "allDone" in result && result.allDone) break;
      }

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
