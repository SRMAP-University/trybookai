import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { cleanEnv } from "@/lib/env";

/** Bump when Prisma schema enums/models change so HMR picks up a new client. */
const PRISMA_SCHEMA_VERSION = 4;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
  prismaSchemaVersion?: number;
};

function getPool() {
  if (globalForPrisma.pgPool) {
    return globalForPrisma.pgPool;
  }

  const connectionString = cleanEnv(process.env.DATABASE_URL);
  const pool = new Pool({
    connectionString,
    // Keep small for Neon pooler; local gen + UI polls share this process.
    max: process.env.NODE_ENV === "development" ? 5 : 3,
    min: 0,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 20_000,
    allowExitOnIdle: true,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

  pool.on("error", (error) => {
    // Neon terminates idle clients — log and keep process alive.
    console.warn("[pg pool]", error.message);
  });

  // Never pool.end() on HMR — background queue + Prisma still hold this pool.
  globalForPrisma.pgPool = pool;
  return pool;
}

function getPrismaClient() {
  if (
    globalForPrisma.prisma &&
    globalForPrisma.prismaSchemaVersion === PRISMA_SCHEMA_VERSION
  ) {
    return globalForPrisma.prisma;
  }

  // Replace stale client after schema changes; keep the shared pool alive.
  const client = new PrismaClient({
    adapter: new PrismaPg(getPool()),
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  globalForPrisma.prisma = client;
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
  return client;
}

export const db = getPrismaClient();

function isTransientDbError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /timeout exceeded when trying to connect/i.test(message) ||
    /Connection terminated unexpectedly/i.test(message) ||
    /Connection terminated due to connection timeout/i.test(message) ||
    /sorry, too many clients/i.test(message) ||
    /ECONNRESET/i.test(message)
  );
}

/** Retry brief Neon pooler blips on critical writes. */
export async function withDbRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 4
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt === attempts) throw error;
      const waitMs = 250 * attempt * attempt;
      console.warn(
        `[db retry] ${label} attempt ${attempt}/${attempts}:`,
        error instanceof Error ? error.message : error,
        `— waiting ${waitMs}ms`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastError;
}