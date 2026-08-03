export type Env = {
  AI: Ai;
  BOOK_GENERATION_WORKFLOW: Workflow<GenerationParams>;
  GENERATION_QUEUE: Queue<GenerationParams>;
  HYPERDRIVE?: Hyperdrive;
  DATABASE_URL?: string;
  GENERATION_WORKER_SECRET: string;
  /** Vercel app origin for push callbacks, e.g. https://www.trybookai.com */
  APP_NOTIFY_URL?: string;
};

export type GenerationParams = {
  bookId: string;
  userId: string;
  jobId: string;
  /** Terminate hung workflow and start a fresh instance. */
  force?: boolean;
};
