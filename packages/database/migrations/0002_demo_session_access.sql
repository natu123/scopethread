ALTER TABLE demo_sessions
  ADD COLUMN IF NOT EXISTS token_hash STRING(64) NULL;

ALTER TABLE demo_sessions
  ADD COLUMN IF NOT EXISTS analysis_requests INT8 NOT NULL DEFAULT 0;

ALTER TABLE demo_sessions
  ADD COLUMN IF NOT EXISTS max_analysis_requests INT8 NOT NULL DEFAULT 6;

CREATE INDEX IF NOT EXISTS demo_sessions_token_hash_idx
  ON demo_sessions (token_hash);
