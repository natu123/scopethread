import { readFile } from "node:fs/promises";
import pg from "pg";

const shouldApply = process.argv.includes("--apply");
const connectionString = process.env.DATABASE_URL?.trim();
const migrationUrl = new URL(
  "../packages/database/migrations/0001_initial.sql",
  import.meta.url,
);
const expectedTables = [
  "agent_runs",
  "conversations",
  "demo_sessions",
  "memory_items",
  "memory_links",
  "projects",
];

if (!shouldApply) {
  console.error("Migration not applied. Re-run with --apply after reviewing the target.");
  process.exitCode = 1;
} else if (!connectionString) {
  console.error("DATABASE_URL is empty in .env.local.");
  process.exitCode = 1;
} else {
  const migrationSql = await readFile(migrationUrl, "utf8");
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: true },
  });

  try {
    await pool.query(migrationSql);

    const tablesResult = await pool.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::STRING[])
        ORDER BY table_name
      `,
      [expectedTables],
    );
    const indexesResult = await pool.query("SHOW INDEX FROM memory_items");
    const createdTables = tablesResult.rows.map((row) => row.table_name);
    const indexNames = indexesResult.rows.map((row) => row.index_name);

    if (createdTables.length !== expectedTables.length) {
      throw new Error(
        `Expected ${expectedTables.length} tables, found ${createdTables.length}.`,
      );
    }
    if (!indexNames.includes("memory_items_embedding_idx")) {
      throw new Error("Vector index memory_items_embedding_idx was not found.");
    }

    console.log("Migration 0001_initial.sql applied successfully.");
    console.log(`Tables verified: ${createdTables.join(", ")}`);
    console.log("Vector index verified: memory_items_embedding_idx");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown migration error";
    console.error(`Migration failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
