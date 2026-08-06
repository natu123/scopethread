import pg from "pg";

const shouldApply = process.argv.includes("--apply");
const connectionString = process.env.DATABASE_URL?.trim();
const ids = {
  session: "10000000-0000-4000-8000-000000000001",
  project: "10000000-0000-4000-8000-000000000002",
  conversation: "10000000-0000-4000-8000-000000000003",
  memory: "10000000-0000-4000-8000-000000000004",
};

if (!shouldApply) {
  console.error("Demo memory not inserted. Re-run with --apply after reviewing it.");
  process.exitCode = 1;
} else if (!connectionString) {
  console.error("DATABASE_URL is empty in .env.local.");
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: true },
  });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO demo_sessions (id, expires_at)
        VALUES ($1, now() + INTERVAL '30 days')
        ON CONFLICT (id) DO NOTHING
      `,
      [ids.session],
    );
    await client.query(
      `
        INSERT INTO projects (id, demo_session_id, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO NOTHING
      `,
      [ids.project, ids.session, "Aozora Dental Clinic Website"],
    );
    await client.query(
      `
        INSERT INTO conversations (
          id,
          project_id,
          idempotency_key,
          source_text
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        ids.conversation,
        ids.project,
        "demo-initial-requirements-v1",
        "Client: We do not need an online booking feature. Phone booking is sufficient for launch.",
      ],
    );
    await client.query(
      `
        INSERT INTO memory_items (
          id,
          project_id,
          source_conversation_id,
          kind,
          status,
          content,
          rationale,
          source_quote,
          confidence
        )
        VALUES ($1, $2, $3, 'decision', 'active', $4, $5, $6, $7)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        ids.memory,
        ids.project,
        ids.conversation,
        "Do not include online booking in the launch scope.",
        "The client confirmed that phone booking is sufficient for the initial release.",
        "We do not need an online booking feature. Phone booking is sufficient for launch.",
        1,
      ],
    );
    await client.query("COMMIT");

    const result = await client.query(
      `
        SELECT
          p.name AS project_name,
          m.kind,
          m.status,
          m.content,
          m.rationale,
          m.source_quote
        FROM memory_items AS m
        JOIN projects AS p ON p.id = m.project_id
        WHERE m.id = $1
      `,
      [ids.memory],
    );

    if (result.rowCount !== 1) {
      throw new Error("The inserted demo memory could not be read back.");
    }

    const memory = result.rows[0];
    console.log("Demo memory persisted and retrieved successfully.");
    console.log(`Project: ${memory.project_name}`);
    console.log(`Memory: ${memory.kind} / ${memory.status}`);
    console.log(`Decision: ${memory.content}`);
    console.log(`Rationale: ${memory.rationale}`);
    console.log(`Source quote: ${memory.source_quote}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    const message = error instanceof Error ? error.message : "Unknown demo seed error";
    console.error(`Demo memory seed failed: ${message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}
