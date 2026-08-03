import type { Env, GenerationParams } from "./env";

export { BookGenerationWorkflow } from "./workflow";

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function verifySecret(req: Request, env: Env): boolean {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(env.GENERATION_WORKER_SECRET) &&
    token === env.GENERATION_WORKER_SECRET;
}

function isInFlight(status: string): boolean {
  return (
    status === "queued" ||
    status === "running" ||
    status === "waiting" ||
    status === "paused"
  );
}

async function terminateIfPossible(
  env: Env,
  instanceId: string
): Promise<boolean> {
  try {
    const existing = await env.BOOK_GENERATION_WORKFLOW.get(instanceId);
    const status = await existing.status();
    if (!isInFlight(status.status)) return false;
    const terminable = existing as {
      terminate?: () => Promise<void>;
    };
    if (typeof terminable.terminate === "function") {
      await terminable.terminate();
      return true;
    }
  } catch (error) {
    console.warn("[enqueue] terminate failed:", instanceId, error);
  }
  return false;
}

type WorkflowHandle = {
  id: string;
  status: () => Promise<{ status: string }>;
  terminate?: () => Promise<void>;
};

async function startWorkflow(
  env: Env,
  params: GenerationParams
): Promise<{ instance: WorkflowHandle; restarted: boolean }> {
  const primaryId = `job-${params.jobId}`;
  const force = Boolean(params.force);

  if (force) {
    await terminateIfPossible(env, primaryId);
    const instance = await env.BOOK_GENERATION_WORKFLOW.create({
      id: `job-${params.jobId}-r${Date.now()}`,
      params,
    });
    return { instance, restarted: true };
  }

  try {
    const instance = await env.BOOK_GENERATION_WORKFLOW.create({
      id: primaryId,
      params,
    });
    return { instance, restarted: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists|duplicate/i.test(message)) throw error;

    try {
      const existing = await env.BOOK_GENERATION_WORKFLOW.get(primaryId);
      const status = await existing.status();
      // Still in flight — do not spawn a second writer for the same job.
      if (isInFlight(status.status)) {
        return { instance: existing, restarted: false };
      }
    } catch {
      // Fall through to a retry instance.
    }

    // Prior instance finished/errored (e.g. stale re-queue) — start a new one.
    const instance = await env.BOOK_GENERATION_WORKFLOW.create({
      id: `job-${params.jobId}-r${Date.now()}`,
      params,
    });
    return { instance, restarted: true };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "bookai-generation" });
    }

    if (request.method === "GET" && url.pathname === "/status") {
      if (!verifySecret(request, env)) return unauthorized();
      const instanceId = url.searchParams.get("instanceId");
      if (!instanceId) {
        return Response.json({ error: "instanceId required" }, { status: 400 });
      }
      const instance = await env.BOOK_GENERATION_WORKFLOW.get(instanceId);
      return Response.json(await instance.status());
    }

    if (request.method === "POST" && url.pathname === "/enqueue") {
      if (!verifySecret(request, env)) return unauthorized();

      let body: GenerationParams;
      try {
        body = (await request.json()) as GenerationParams;
      } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
      }

      if (!body?.bookId || !body?.userId || !body?.jobId) {
        return Response.json(
          { error: "bookId, userId, and jobId are required" },
          { status: 400 }
        );
      }

      try {
        const { instance, restarted } = await startWorkflow(env, body);
        // Also push to queue as a durable backup trigger.
        try {
          await env.GENERATION_QUEUE.send(body);
        } catch (error) {
          console.warn("[enqueue] queue send failed:", error);
        }
        return Response.json({
          ok: true,
          instanceId: instance.id,
          jobId: body.jobId,
          restarted,
          alreadyRunning: !restarted && !body.force,
        });
      } catch (error) {
        // Already exists — treat as success (idempotent re-enqueue).
        const message = error instanceof Error ? error.message : String(error);
        if (/already exists|duplicate/i.test(message) && !body.force) {
          return Response.json({
            ok: true,
            instanceId: `job-${body.jobId}`,
            alreadyRunning: true,
            restarted: false,
          });
        }
        // Force path collided — try a unique retry id once more.
        if (body.force && /already exists|duplicate/i.test(message)) {
          try {
            const instance = await env.BOOK_GENERATION_WORKFLOW.create({
              id: `job-${body.jobId}-r${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 7)}`,
              params: body,
            });
            return Response.json({
              ok: true,
              instanceId: instance.id,
              jobId: body.jobId,
              restarted: true,
            });
          } catch (retryError) {
            console.error("[enqueue] force retry failed:", retryError);
          }
        }
        console.error("[enqueue] workflow create failed:", error);
        return Response.json(
          { error: message.slice(0, 500) },
          { status: 500 }
        );
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },

  async queue(
    batch: MessageBatch<GenerationParams>,
    env: Env
  ): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await startWorkflow(env, msg.body);
        msg.ack();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/already exists|duplicate/i.test(message)) {
          msg.ack();
          continue;
        }
        console.error("[queue] failed to start workflow:", error);
        msg.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, GenerationParams>;
