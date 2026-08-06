import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
const targetTables = [
  "agent_runs",
  "conversations",
  "demo_sessions",
  "memory_items",
  "memory_links",
  "projects",
];

if (!connectionString) {
  console.error("DATABASE_URL is empty in .env.local.");
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: true },
  });

  try {
    const [versionResult, vectorSettingResult, tablesResult] = await Promise.all([
      pool.query("SELECT version() AS version"),
      pool.query("SHOW CLUSTER SETTING feature.vector_index.enabled"),
      pool.query(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ANY($1::STRING[])
          ORDER BY table_name
        `,
        [targetTables],
      ),
    ]);

    const existingTables = tablesResult.rows.map((row) => row.table_name);
    const vectorSetting = Object.values(vectorSettingResult.rows[0] ?? {})[0];

    console.log(`CockroachDB: ${versionResult.rows[0].version}`);
    console.log(`Vector index feature enabled: ${vectorSetting}`);
    console.log(
      existingTables.length === 0
        ? "Target tables: none exist yet"
        : `Target tables already present: ${existingTables.join(", ")}`,
    );

    if (vectorSetting !== true && vectorSetting !== "true") {
      console.error("Migration is not ready: vector indexing is disabled.");
      process.exitCode = 1;
    } else if (existingTables.length > 0) {
      console.error("Migration is not ready: one or more target tables already exist.");
      process.exitCode = 1;
    } else {
      console.log("Migration preflight succeeded.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown preflight error";
    console.error(`Migration preflight failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
