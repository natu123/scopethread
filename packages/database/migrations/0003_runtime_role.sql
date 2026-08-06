CREATE ROLE IF NOT EXISTS scopethread_runtime WITH NOLOGIN;

REVOKE CREATE ON SCHEMA public FROM public;

GRANT CONNECT ON DATABASE defaultdb TO scopethread_runtime;
GRANT USAGE ON SCHEMA public TO scopethread_runtime;

GRANT SELECT, INSERT, UPDATE
  ON TABLE demo_sessions
  TO scopethread_runtime;

GRANT SELECT, INSERT
  ON TABLE projects, conversations, memory_links
  TO scopethread_runtime;

GRANT SELECT, INSERT, UPDATE
  ON TABLE memory_items, agent_runs
  TO scopethread_runtime;
