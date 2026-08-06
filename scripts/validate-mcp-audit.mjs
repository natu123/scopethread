import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const runbook = await readFile(new URL("docs/MCP_AUDIT_RUNBOOK.md", root), "utf8");
const initialMigration = await readFile(
  new URL("packages/database/migrations/0001_initial.sql", root),
  "utf8",
);

function fail(message) {
  throw new Error(message);
}

function normalize(statement) {
  return statement.replace(/\s+/g, " ").trim();
}

function tableDefinition(tableName) {
  const marker = `CREATE TABLE IF NOT EXISTS ${tableName} (`;
  const start = initialMigration.indexOf(marker);
  if (start < 0) {
    fail(`Migration is missing table ${tableName}.`);
  }

  let depth = 0;
  let opened = false;
  for (let index = start + marker.length - 1; index < initialMigration.length; index += 1) {
    const character = initialMigration[index];
    if (character === "(") {
      depth += 1;
      opened = true;
    } else if (character === ")") {
      depth -= 1;
      if (opened && depth === 0) {
        return initialMigration.slice(start, index + 1);
      }
    }
  }

  fail(`Migration table ${tableName} is not terminated.`);
}

const sqlStatements = [...runbook.matchAll(/```sql\s*\r?\n([\s\S]*?)```/g)].map(
  (match) => match[1].trim(),
);
if (sqlStatements.length !== 4) {
  fail(`Expected four allowlisted audit statements, found ${sqlStatements.length}.`);
}

const selectStatements = sqlStatements.filter((statement) => /^SELECT\b/i.test(statement));
const showStatements = sqlStatements.filter((statement) => /^SHOW\b/i.test(statement));
if (selectStatements.length !== 3 || showStatements.length !== 1) {
  fail("The MCP audit must contain exactly three SELECT statements and one SHOW statement.");
}

const forbiddenSql =
  /\b(?:ALTER|CALL|COPY|CREATE|DELETE|DROP|EXPORT|GRANT|IMPORT|INSERT|REVOKE|TRUNCATE|UPDATE|UPSERT)\b/i;
const forbiddenData = /\b(?:demo_sessions|token_hash|embedding)\b/i;
const allowedTables = new Set(["agent_runs", "memory_items", "memory_links", "projects"]);

for (const statement of sqlStatements) {
  const trimmed = statement.trim();
  if (!trimmed.endsWith(";") || trimmed.slice(0, -1).includes(";")) {
    fail("Each MCP audit tool call must contain exactly one terminated SQL statement.");
  }
  if (forbiddenSql.test(trimmed)) {
    fail("The MCP audit allowlist contains a write or administrative SQL keyword.");
  }
  if (forbiddenData.test(trimmed)) {
    fail("The MCP audit allowlist exposes a forbidden table or sensitive column.");
  }

  for (const match of trimmed.matchAll(/\b(?:FROM|JOIN)\s+([a-z0-9_.]+)/gi)) {
    const table = match[1].split(".").at(-1);
    if (!allowedTables.has(table)) {
      fail(`The MCP audit references non-allowlisted table ${match[1]}.`);
    }
  }
}

for (const statement of selectStatements) {
  if (/\bSELECT\s+\*/i.test(statement)) {
    fail("MCP audit SELECT statements must name every returned column explicitly.");
  }
  if (!/\bLIMIT\s+\d+\s*;/i.test(statement)) {
    fail("Every MCP audit SELECT statement must include an explicit numeric LIMIT.");
  }
  if (!statement.includes("{agent-run-id}")) {
    fail("Every MCP audit SELECT statement must scope results through the agent run ID.");
  }
}

const expectedLimits = ["LIMIT 1;", "LIMIT 25;", "LIMIT 10;"];
for (const [index, limit] of expectedLimits.entries()) {
  if (!normalize(selectStatements[index]).endsWith(limit)) {
    fail(`MCP audit SELECT statement ${index + 1} must end with ${limit}`);
  }
}

if (
  normalize(showStatements[0]) !==
  "SHOW INDEXES FROM defaultdb.public.memory_items;"
) {
  fail("The MCP audit SHOW allowlist must inspect only the memory_items indexes.");
}

const requiredSchema = new Map([
  [
    "agent_runs",
    [
      "id",
      "project_id",
      "status",
      "chat_model_id",
      "embedding_model_id",
      "duration_ms",
      "error_code",
      "created_at",
    ],
  ],
  ["projects", ["id", "name"]],
  [
    "memory_items",
    [
      "id",
      "project_id",
      "kind",
      "status",
      "content",
      "rationale",
      "source_quote",
      "confidence",
      "created_at",
      "updated_at",
    ],
  ],
  [
    "memory_links",
    [
      "project_id",
      "from_memory_id",
      "to_memory_id",
      "relation",
      "reason",
      "created_at",
    ],
  ],
]);

for (const [table, columns] of requiredSchema) {
  const definition = tableDefinition(table);
  for (const column of columns) {
    if (!new RegExp(`\\n\\s+${column}\\s`, "i").test(definition)) {
      fail(`MCP audit expects missing schema column ${table}.${column}.`);
    }
  }
}

const requiredControls = [
  'url = "https://cockroachlabs.cloud/mcp"',
  '"mcp-cluster-id" = "{your-cluster-id}"',
  "codex mcp login cockroachdb-cloud",
  "OAuth",
  "read** permission only",
  "`select_query`",
  "`show_statement`",
];
for (const control of requiredControls) {
  if (!runbook.includes(control)) {
    fail(`MCP audit runbook is missing required control: ${control}`);
  }
}

console.log(
  "MCP audit runbook verified: single-cluster OAuth, read-only tools, four allowlisted statements, and schema-safe columns.",
);
