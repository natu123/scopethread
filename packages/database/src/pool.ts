import { Pool } from "pg";

let pool: Pool | undefined;

export function getPool(connectionString: string): Pool {
  pool ??= new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 5_000,
    ssl: { rejectUnauthorized: true },
  });
  return pool;
}
