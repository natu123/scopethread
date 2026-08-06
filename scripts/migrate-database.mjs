import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const shouldApply = process.argv.includes("--apply");
const shouldVerify = process.argv.includes("--verify");
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
const expectedRuntimeTablePrivileges = new Map([
  ["agent_runs", ["INSERT", "SELECT", "UPDATE"]],
  ["conversations", ["INSERT", "SELECT"]],
  ["demo_sessions", ["INSERT", "SELECT", "UPDATE"]],
  ["memory_items", ["INSERT", "SELECT", "UPDATE"]],
  ["memory_links", ["INSERT", "SELECT"]],
  ["projects", ["INSERT", "SELECT"]],
]);

if (shouldApply && shouldVerify) {
  console.error("Choose either --apply or --verify, not both.");
  process.exitCode = 1;
} else if (!shouldApply && !shouldVerify) {
  console.error(
    "Migration not applied. Re-run with --apply, or inspect existing live state with --verify.",
  );
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
    if (shouldApply) {
      for (const migrationFile of migrationFiles) {
        const migrationSql = await readFile(
          new URL(migrationFile, migrationsUrl),
          "utf8",
        );
        await pool.query(migrationSql);
        console.log(`Migration ${migrationFile} applied successfully.`);
      }
    } else {
      console.log("Migration application skipped; verifying existing live state.");
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
    const runtimeRoleResult = await pool.query(
      `SELECT username, options
       FROM [SHOW ROLES]
       WHERE username = 'scopethread_runtime'`,
    );
    const runtimeMembershipsResult = await pool.query(
      "SHOW GRANTS ON ROLE FOR scopethread_runtime",
    );
    const runtimeDatabaseGrantsResult = await pool.query(
      "SHOW GRANTS ON DATABASE defaultdb FOR scopethread_runtime",
    );
    const runtimeSchemaGrantsResult = await pool.query(
      "SHOW GRANTS ON SCHEMA public FOR scopethread_runtime",
    );
    const runtimeTableGrantsResult = await pool.query(
      `SELECT table_name, privilege_type
       FROM information_schema.table_privileges
       WHERE table_schema = 'public'
         AND grantee = 'scopethread_runtime'
       ORDER BY table_name, privilege_type`,
    );
    const publicSchemaGrantsResult = await pool.query(
      "SHOW GRANTS ON SCHEMA public FOR public",
    );
    const createdTables = tablesResult.rows.map((row) => row.table_name);
    const indexNames = indexesResult.rows.map((row) => row.index_name);
    const sessionColumns = sessionColumnsResult.rows.map(
      (row) => row.column_name,
    );
    const sessionIndexNames = sessionIndexesResult.rows.map(
      (row) => row.index_name,
    );
    const runtimePrivileges = new Map();
    for (const row of runtimeTableGrantsResult.rows) {
      const privileges = runtimePrivileges.get(row.table_name) ?? [];
      privileges.push(row.privilege_type);
      runtimePrivileges.set(row.table_name, privileges);
    }

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
    if (runtimeRoleResult.rowCount !== 1) {
      throw new Error("Runtime role scopethread_runtime was not found.");
    }
    const runtimeRoleOptions = runtimeRoleResult.rows[0]?.options ?? [];
    if (!runtimeRoleOptions.includes("NOLOGIN")) {
      throw new Error("Runtime role scopethread_runtime must use NOLOGIN.");
    }
    if (
      runtimeMembershipsResult.rows.some(
        (row) => row.role_name === "admin",
      )
    ) {
      throw new Error("Runtime role scopethread_runtime must not inherit admin.");
    }
    if (
      !runtimeDatabaseGrantsResult.rows.some(
        (row) => row.privilege_type === "CONNECT",
      )
    ) {
      throw new Error("Runtime role scopethread_runtime requires database CONNECT.");
    }
    if (
      !runtimeSchemaGrantsResult.rows.some(
        (row) => row.privilege_type === "USAGE",
      ) ||
      runtimeSchemaGrantsResult.rows.some(
        (row) => row.privilege_type === "CREATE",
      )
    ) {
      throw new Error(
        "Runtime role scopethread_runtime requires schema USAGE without CREATE.",
      );
    }
    if (
      publicSchemaGrantsResult.rows.some(
        (row) => row.privilege_type === "CREATE",
      )
    ) {
      throw new Error("The public role must not create objects in public schema.");
    }
    for (const [tableName, expectedPrivileges] of expectedRuntimeTablePrivileges) {
      const actualPrivileges = runtimePrivileges.get(tableName) ?? [];
      if (actualPrivileges.join(",") !== expectedPrivileges.join(",")) {
        throw new Error(
          `Unexpected runtime privileges for ${tableName}: ${actualPrivileges.join(",")}`,
        );
      }
    }

    console.log(`Tables verified: ${createdTables.join(", ")}`);
    console.log("Vector index verified: memory_items_embedding_idx");
    console.log(`Demo session columns verified: ${sessionColumns.join(", ")}`);
    console.log("Demo session index verified: demo_sessions_token_hash_idx");
    console.log("Least-privilege runtime role verified: scopethread_runtime");
    console.log("Runtime role scope verified: NOLOGIN, CONNECT, and schema USAGE without CREATE.");
    console.log("Public schema CREATE privilege verified as revoked.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown migration error";
    console.error(`Migration failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
