import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { cleanEnv } from "@/lib/env";

/** Bump when Prisma schema enums/models change so HMR picks up a new client. */
const PRISMA_SCHEMA_VERSION = 3;

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
    max: 3,
    min: 0,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
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
