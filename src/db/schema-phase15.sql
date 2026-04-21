-- ============================================================
-- AutoOrg Phase 15 Schema
-- Dynamic model provider configuration
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLE: llm_providers
-- Registry of LLM backends (OpenAI, Ollama, etc.)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS llm_providers (
  id              TEXT PRIMARY KEY,         -- nanoid
  name            TEXT NOT NULL,            -- e.g. "Main Ollama"
  provider_type   TEXT NOT NULL,            -- anthropic|openai|ollama|groq|etc.
  base_url        TEXT,                     -- override for local/proxy
  api_key         TEXT,                     -- actual key or placeholder
  is_enabled      INTEGER DEFAULT 1,        -- boolean
  is_default      INTEGER DEFAULT 0,        -- boolean
  metadata_json   TEXT DEFAULT '{}',        -- extra settings
  created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: llm_models
-- Specific model definitions and aliases
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS llm_models (
  id              TEXT PRIMARY KEY,
  provider_id     TEXT NOT NULL REFERENCES llm_providers(id) ON DELETE CASCADE,
  model_name      TEXT NOT NULL,            -- e.g. "llama3:70b" or "gpt-4o"
  alias           TEXT,                     -- e.g. "fast_model" or "smart_model"
  context_window  INTEGER,
  is_active       INTEGER DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_llm_models_provider ON llm_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_llm_models_alias ON llm_models(alias);
