# Book generation worker (Cloudflare Workflows)

Durable book generation for BookAI. Vercel inserts a `GenerationJob` (`QUEUED`) and POSTs here; this worker runs outline + section writes as Workflow steps against Neon so generation is not killed by serverless timeouts.

## Architecture

1. Next.js (`GENERATION_RUNNER=cloudflare`) → `POST /enqueue` with `{ bookId, userId, jobId }`
2. Worker creates a `BookGenerationWorkflow` instance (and optionally queues a backup message)
3. Steps: `claim` → `outline` → `section:{id}`… → `finalize`
4. Progress/SSE stay on Vercel via DB polling (`watchGenerationStream`)

Cancel: Vercel sets `Book.status = PAUSED` and fails active jobs; each step calls `assertNotPaused` and stops.

## Setup

```bash
cd workers/book-generation
npm install
```

### Secrets

```bash
npx wrangler secret put GENERATION_WORKER_SECRET
npx wrangler secret put DATABASE_URL   # Neon connection string (prefer pooled/Hyperdrive)
```

Optional Hyperdrive (uncomment in `wrangler.toml` after creating one):

```bash
npx wrangler hyperdrive create bookai-neon --connection-string="$DATABASE_URL"
```

### Deploy

```bash
npm run deploy
```

Note the worker URL (e.g. `https://bookai-generation.<account>.workers.dev`).

### Vercel env

| Variable | Value |
|---|---|
| `GENERATION_RUNNER` | `cloudflare` |
| `GENERATION_WORKER_URL` | Worker base URL (no trailing slash) |
| `GENERATION_WORKER_SECRET` | Same value as CF secret |

Local Next.js without the worker:

```bash
GENERATION_RUNNER=local
```

(or omit `GENERATION_WORKER_URL`)

## HTTP API

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | none | Liveness |
| `POST` | `/enqueue` | `Authorization: Bearer <secret>` | Start/resume workflow for a job |
| `GET` | `/status?instanceId=` | Bearer | Workflow instance status |

## Runbooks

### Generation stuck / no progress

1. Check CF dashboard → Workers → `bookai-generation` → Workflows / Logs.
2. Confirm Vercel has `GENERATION_RUNNER=cloudflare` and the worker URL/secret.
3. Hit generate/resume on the book (calls `ensureGenerationRunning`, which re-queues RUNNING jobs with `updatedAt` older than 15 minutes and re-POSTs `/enqueue`).
4. `GET /status?instanceId=job-<jobId>` with the worker secret.

### Cancel not stopping

Confirm cancel API set `Book.status = PAUSED`. The workflow stops at the next step boundary (`assertNotPaused`). In-flight AI calls finish the current step first.

### Local development

- App: `GENERATION_RUNNER=local` uses the in-process queue in `background.ts`.
- Worker: `npm run dev` in this folder; point `GENERATION_WORKER_URL` at the local wrangler URL and set `GENERATION_RUNNER=cloudflare` to test the full path.

### Audiobook

Still runs on Vercel (`audio-generator`). Same timeout risk — migrate later if needed.

### Push notifications

After outline / progress milestones / completion, the worker POSTs to
`${APP_NOTIFY_URL}/api/internal/push` (Bearer `GENERATION_WORKER_SECRET`).
Vercel delivers FCM when `FIREBASE_SERVICE_ACCOUNT_JSON` is set. See `mobile/PUSH.md`.
