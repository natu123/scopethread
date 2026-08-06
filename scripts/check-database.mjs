import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  console.error(
    "DATABASE_URL is empty. Add the CockroachDB General connection string to .env.local.",
  );
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 1_000,
    ssl: { rejectUnauthorized: true },
  });

  try {
    const result = await pool.query(`
      SELECT
        current_database() AS database_name,
        current_user AS user_name,
        now() AS server_time
    `);
    const connection = result.rows[0];

    console.log("CockroachDB connection succeeded.");
    console.log(`Database: ${connection.database_name}`);
    console.log(`SQL user: ${connection.user_name}`);
    console.log(`Server time: ${connection.server_time.toISOString()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    console.error(`CockroachDB connection failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
