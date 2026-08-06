import { randomBytes } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const runtimeUsername = "scopethread_app";
const runtimeRole = "scopethread_runtime";
const outputUrl = new URL("../.env.runtime.local", import.meta.url);
const shouldApply = process.argv.includes("--apply");
const connectionString = process.env.DATABASE_URL?.trim();
const expectedPrivileges = new Map([
  ["agent_runs", ["INSERT", "SELECT", "UPDATE"]],
  ["conversations", ["INSERT", "SELECT"]],
  ["demo_sessions", ["INSERT", "SELECT", "UPDATE"]],
  ["memory_items", ["INSERT", "SELECT", "UPDATE"]],
  ["memory_links", ["INSERT", "SELECT"]],
  ["projects", ["INSERT", "SELECT"]],
]);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (process.argv.includes("--help")) {
  console.log(`Usage:
  npm run db:provision-runtime -- --apply

Without --apply, this command checks only its local prerequisites. With
--apply, it creates or rotates the scopethread_app SQL user, grants the
scopethread_runtime role, verifies effective read/write boundaries, and writes
the ignored .env.runtime.local file without printing its credential.`);
} else if (!connectionString) {
  fail("DATABASE_URL is empty in .env.local.");
} else {
  let adminUrl;
  try {
    adminUrl = new URL(connectionString);
  } catch {
    fail("DATABASE_URL is not a valid URL.");
  }

  if (adminUrl && decodeURIComponent(adminUrl.username) === runtimeUsername) {
    fail("DATABASE_URL must use the migration identity, not scopethread_app.");
  } else if (!shouldApply) {
    console.log(
      "Runtime-user dry gate passed. No database connection or file write occurred. Re-run with --apply after explicit approval.",
    );
  } else if (adminUrl) {
    const password = randomBytes(36).toString("base64url");
    const runtimeUrl = new URL(adminUrl);
    runtimeUrl.username = runtimeUsername;
    runtimeUrl.password = password;
    const runtimeConnectionString = runtimeUrl.toString();
    const adminPool = new pg.Pool({
      connectionString,
      max: 1,
      connectionTimeoutMillis: 10_000,
      ssl: { rejectUnauthorized: true },
    });
    let runtimePool;

    try {
      const roleResult = await adminPool.query(
        `SELECT username
         FROM [SHOW ROLES]
         WHERE username = $1`,
        [runtimeRole],
      );
      if (roleResult.rowCount !== 1) {
        throw new Error(
          "Apply migration 0003_runtime_role.sql before provisioning the runtime user.",
        );
      }

      await adminPool.query(
        `CREATE USER IF NOT EXISTS ${runtimeUsername}
         WITH LOGIN PASSWORD '${password}'`,
      );
      await adminPool.query(
        `ALTER USER ${runtimeUsername} WITH PASSWORD '${password}'`,
      );
      await adminPool.query(`GRANT ${runtimeRole} TO ${runtimeUsername}`);

      runtimePool = new pg.Pool({
        connectionString: runtimeConnectionString,
        max: 1,
        connectionTimeoutMillis: 10_000,
        ssl: { rejectUnauthorized: true },
      });
      const identityResult = await runtimePool.query(
        "SELECT current_user AS username",
      );
      if (identityResult.rows[0]?.username !== runtimeUsername) {
        throw new Error("Runtime connection returned an unexpected SQL identity.");
      }

      const membershipResult = await runtimePool.query(
        `SELECT role_name
         FROM [SHOW GRANTS ON ROLE FOR ${runtimeUsername}]`,
      );
      const memberships = membershipResult.rows.map((row) => row.role_name);
      if (
        !memberships.includes(runtimeRole) ||
        memberships.includes("admin")
      ) {
        throw new Error("Runtime user has an unexpected role membership.");
      }

      const grantsResult = await runtimePool.query(
        `SELECT table_name, privilege_type
         FROM information_schema.table_privileges
         WHERE table_schema = 'public'
           AND grantee = $1
         ORDER BY table_name, privilege_type`,
        [runtimeRole],
      );
      const actualPrivileges = new Map();
      for (const row of grantsResult.rows) {
        const privileges = actualPrivileges.get(row.table_name) ?? [];
        privileges.push(row.privilege_type);
        actualPrivileges.set(row.table_name, privileges);
      }
      for (const [tableName, privileges] of expectedPrivileges) {
        const actual = actualPrivileges.get(tableName) ?? [];
        if (actual.join(",") !== privileges.join(",")) {
          throw new Error(
            `Runtime privilege verification failed for ${tableName}.`,
          );
        }
      }

      const schemaGrantsResult = await runtimePool.query(
        `SELECT privilege_type
         FROM [SHOW GRANTS ON SCHEMA public FOR ${runtimeUsername}]`,
      );
      if (
        schemaGrantsResult.rows.some(
          (row) => row.privilege_type === "CREATE",
        )
      ) {
        throw new Error("Runtime user unexpectedly has public-schema CREATE.");
      }
      await runtimePool.query("SELECT id FROM projects LIMIT 1");

      await writeFile(
        outputUrl,
        `# Generated by scripts/provision-runtime-user.mjs. Do not commit.\nRUNTIME_DATABASE_URL=${runtimeConnectionString}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      await chmod(outputUrl, 0o600).catch(() => undefined);
      console.log(
        `Runtime SQL identity verified. Credential saved to ${fileURLToPath(outputUrl)} without being printed.`,
      );
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Unknown error";
      const safeMessage = rawMessage
        .replaceAll(connectionString, "[redacted]")
        .replaceAll(runtimeConnectionString, "[redacted]")
        .replaceAll(password, "[redacted]");
      fail(`Runtime-user provisioning failed: ${safeMessage}`);
    } finally {
      await runtimePool?.end().catch(() => undefined);
      await adminPool.end().catch(() => undefined);
    }
  }
}
