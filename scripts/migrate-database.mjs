import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const shouldApply = process.argv.includes("--apply");
const connectionString = process.env.DATABASE_URL?.trim();
const migrationsUrl = new URL("../packages/database/migrations/", import.meta.url);
const expectedTables = [
  "agent_runs",
  "conversations",
  "demo_sessions",
  "memory_items",
  "memory_links",
  "projects",
];
const expectedSessionColumns = [
  "analysis_requests",
  "max_analysis_requests",
  "token_hash",
];

if (!shouldApply) {
  console.error("Migration not applied. Re-run with --apply after reviewing the target.");
  process.exitCode = 1;
} else if (!connectionString) {
  console.error("DATABASE_URL is empty in .env.local.");
  process.exitCode = 1;
} else {
  const migrationFiles = (await readdir(migrationsUrl))
    .filter((fileName) => /^\d{4}_[a-z0-9_]+\.sql$/.test(fileName))
    .sort();
  if (migrationFiles.length === 0) {
    throw new Error("No database migrations were found.");
  }
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: true },
  });

  try {
    for (const migrationFile of migrationFiles) {
      const migrationSql = await readFile(
        new URL(migrationFile, migrationsUrl),
        "utf8",
      );
      await pool.query(migrationSql);
      console.log(`Migration ${migrationFile} applied successfully.`);
    }

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
    const sessionColumnsResult = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'demo_sessions'
         AND column_name = ANY($1::STRING[])
       ORDER BY column_name`,
      [expectedSessionColumns],
    );
    const sessionIndexesResult = await pool.query("SHOW INDEX FROM demo_sessions");
    const createdTables = tablesResult.rows.map((row) => row.table_name);
    const indexNames = indexesResult.rows.map((row) => row.index_name);
    const sessionColumns = sessionColumnsResult.rows.map(
      (row) => row.column_name,
    );
    const sessionIndexNames = sessionIndexesResult.rows.map(
      (row) => row.index_name,
    );

    if (createdTables.length !== expectedTables.length) {
      throw new Error(
        `Expected ${expectedTables.length} tables, found ${createdTables.length}.`,
      );
    }
    if (!indexNames.includes("memory_items_embedding_idx")) {
      throw new Error("Vector index memory_items_embedding_idx was not found.");
    }
    if (sessionColumns.length !== expectedSessionColumns.length) {
      throw new Error(
        `Expected ${expectedSessionColumns.length} demo session access columns, found ${sessionColumns.length}.`,
      );
    }
    if (!sessionIndexNames.includes("demo_sessions_token_hash_idx")) {
      throw new Error("Index demo_sessions_token_hash_idx was not found.");
    }

    console.log(`Tables verified: ${createdTables.join(", ")}`);
    console.log("Vector index verified: memory_items_embedding_idx");
    console.log(`Demo session columns verified: ${sessionColumns.join(", ")}`);
    console.log("Demo session index verified: demo_sessions_token_hash_idx");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown migration error";
    console.error(`Migration failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
