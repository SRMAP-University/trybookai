import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/** Neon pooler-friendly defaults for interactive transactions. */
export const TX_OPTIONS: {
  maxWait: number;
  timeout: number;
} = {
  maxWait: 10_000,
  timeout: 20_000,
};

export function dbTransaction<R>(
  fn: (tx: Prisma.TransactionClient) => Promise<R>
): Promise<R> {
  return db.$transaction(fn, TX_OPTIONS);
}
