import postgres from "postgres";
import type { Env } from "../env";

export type Sql = ReturnType<typeof postgres>;

export function createSql(env: Env): Sql {
  const connectionString =
    env.HYPERDRIVE?.connectionString || env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL secret or HYPERDRIVE binding required for generation worker."
    );
  }
  return postgres(connectionString, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
}

export async function withSql<T>(
  env: Env,
  fn: (sql: Sql) => Promise<T>
): Promise<T> {
  const sql = createSql(env);
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
