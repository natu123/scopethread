import { readFile } from "node:fs/promises";

const runtimeMigrationPath = new URL(
  "../packages/database/migrations/0003_runtime_role.sql",
  import.meta.url,
);
const source = await readFile(runtimeMigrationPath, "utf8");
const normalized = source.replace(/\s+/g, " ").trim().toUpperCase();

const requiredStatements = [
  "CREATE ROLE IF NOT EXISTS SCOPETHREAD_RUNTIME WITH NOLOGIN",
  "GRANT CONNECT ON DATABASE DEFAULTDB TO SCOPETHREAD_RUNTIME",
  "GRANT USAGE ON SCHEMA PUBLIC TO SCOPETHREAD_RUNTIME",
  "GRANT SELECT, INSERT, UPDATE ON TABLE DEMO_SESSIONS TO SCOPETHREAD_RUNTIME",
  "GRANT SELECT, INSERT ON TABLE PROJECTS, CONVERSATIONS, MEMORY_LINKS TO SCOPETHREAD_RUNTIME",
  "GRANT SELECT, INSERT, UPDATE ON TABLE MEMORY_ITEMS, AGENT_RUNS TO SCOPETHREAD_RUNTIME",
];

for (const statement of requiredStatements) {
  if (!normalized.includes(statement)) {
    throw new Error(`Runtime-role migration is missing: ${statement}`);
  }
}

const forbiddenPatterns = [
  /GRANT\s+ALL\b/,
  /GRANT\s+[^;]*\bDELETE\b/,
  /GRANT\s+[^;]*\bCREATE\b/,
  /GRANT\s+[^;]*\bDROP\b/,
  /ALTER\s+DEFAULT\s+PRIVILEGES/,
  /WITH\s+GRANT\s+OPTION/,
];
for (const pattern of forbiddenPatterns) {
  if (pattern.test(normalized)) {
    throw new Error(`Runtime-role migration contains forbidden access: ${pattern}`);
  }
}

console.log("Runtime database role migration is least-privilege and valid.");
