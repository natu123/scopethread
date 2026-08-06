CREATE TABLE IF NOT EXISTS demo_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demo_session_id UUID NOT NULL REFERENCES demo_sessions (id) ON DELETE CASCADE,
  name STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  INDEX projects_session_idx (demo_session_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  idempotency_key STRING NOT NULL,
  source_text STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, idempotency_key),
  INDEX conversations_project_idx (project_id, created_at DESC)
);

CREATE TABLE IF NOT EXISTS memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  source_conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  kind STRING NOT NULL CHECK (kind IN ('requirement', 'decision', 'rationale', 'open_question')),
  status STRING NOT NULL CHECK (status IN ('proposed', 'active', 'superseded', 'resolved', 'dismissed')),
  content STRING NOT NULL,
  rationale STRING NULL,
  source_quote STRING NOT NULL,
  confidence DECIMAL(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  embedding VECTOR(1024) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  INDEX memory_items_project_status_idx (project_id, status, kind),
  VECTOR INDEX memory_items_embedding_idx (project_id, embedding vector_cosine_ops)
);

CREATE TABLE IF NOT EXISTS memory_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  from_memory_id UUID NOT NULL REFERENCES memory_items (id) ON DELETE CASCADE,
  to_memory_id UUID NOT NULL REFERENCES memory_items (id) ON DELETE CASCADE,
  relation STRING NOT NULL CHECK (relation IN ('supersedes', 'supports', 'conflicts_with')),
  reason STRING NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_memory_id, to_memory_id, relation),
  INDEX memory_links_project_idx (project_id, relation)
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  conversation_id UUID NULL REFERENCES conversations (id) ON DELETE SET NULL,
  status STRING NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
  chat_model_id STRING NULL,
  embedding_model_id STRING NULL,
  duration_ms INT8 NULL CHECK (duration_ms >= 0),
  error_code STRING NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  INDEX agent_runs_project_idx (project_id, created_at DESC)
);
