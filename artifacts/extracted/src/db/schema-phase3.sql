SQL

-- ============================================================
-- AutoOrg Phase 3 Schema
-- Full three-tier memory system + fact store + dream engine
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLE: facts
-- The structured fact store — the heart of tier-2 memory.
-- Every fact has a confidence score, source, and lifecycle.
--
-- Facts flow:
--   raw transcript → DreamAgent extracts → fact_store
--   fact_store → Archivist reads → agent context
--   fact_store → MEMORY.md index (pointers only)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facts (
  id              TEXT PRIMARY KEY,           -- "fact_XXXXXXXX"
  run_id          TEXT NOT NULL,

  -- Content
  statement       TEXT NOT NULL,              -- The absolute fact statement
  category        TEXT NOT NULL               -- 'validated_decision'|'failed_approach'
                    CHECK(category IN (       --   |'domain_knowledge'|'pattern'
                      'validated_decision',   --   |'anti_pattern'|'constraint'
                      'failed_approach',      --   |'agent_behavior'
                      'domain_knowledge',
                      'pattern',
                      'anti_pattern',
                      'constraint',
                      'agent_behavior'
                    )),

  -- Provenance
  source_cycle    INTEGER NOT NULL,           -- Cycle where this was first observed
  source_type     TEXT NOT NULL,              -- 'dream'|'archivist'|'ratchet'|'manual'
  evidence        TEXT,                       -- Quote or reference from transcript

  -- Confidence
  confidence      REAL NOT NULL DEFAULT 0.5, -- 0.0-1.0
  confirmation_count INTEGER DEFAULT 1,       -- How many times confirmed
  contradiction_count INTEGER DEFAULT 0,      -- How many times contradicted

  -- Lifecycle
  active          INTEGER NOT NULL DEFAULT 1, -- Boolean: in use
  superseded_by   TEXT REFERENCES facts(id),  -- If replaced by a newer fact
  last_confirmed  INTEGER,                    -- Cycle number of last confirmation

  -- Embeddings (for semantic search)
  embedding       BLOB,                       -- float32[] serialized

  created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_facts_run      ON facts(run_id);
CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(run_id, category);
CREATE INDEX IF NOT EXISTS idx_facts_active   ON facts(run_id, active);
CREATE INDEX IF NOT EXISTS idx_facts_confidence ON facts(confidence DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: dream_runs
-- Log of every autoDream execution
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dream_runs (
  id                    TEXT PRIMARY KEY,
  run_id                TEXT NOT NULL,
  triggered_by          TEXT NOT NULL,  -- 'interval'|'plateau'|'budget_warning'|'manual'
  cycle_number          INTEGER NOT NULL,

  -- What was processed
  transcripts_scanned   INTEGER DEFAULT 0,
  transcript_entries    INTEGER DEFAULT 0,

  -- What changed
  facts_extracted       INTEGER DEFAULT 0,
  facts_updated         INTEGER DEFAULT 0,
  facts_superseded      INTEGER DEFAULT 0,
  contradictions_found  INTEGER DEFAULT 0,
  contradictions_resolved INTEGER DEFAULT 0,
  patterns_identified   INTEGER DEFAULT 0,
  anti_patterns_identified INTEGER DEFAULT 0,

  -- Memory changes
  memory_index_lines_before INTEGER,
  memory_index_lines_after  INTEGER,
  memory_pruned         INTEGER DEFAULT 0,  -- Boolean

  -- Quality
  dream_quality_score   REAL,               -- How good was the consolidation?
  llm_cost_usd          REAL DEFAULT 0,
  duration_ms           INTEGER,

  -- Output
  dream_report          TEXT,               -- Human-readable consolidation summary
  raw_llm_output        TEXT,               -- Full LLM response (for debugging)

  started_at            DATETIME NOT NULL DEFAULT (datetime('now')),
  ended_at              DATETIME
);

CREATE INDEX IF NOT EXISTS idx_dreams_run ON dream_runs(run_id, cycle_number);

-- ────────────────────────────────────────────────────────────
-- TABLE: embeddings_cache
-- Cache computed embeddings to avoid recomputation
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS embeddings_cache (
  content_hash  TEXT PRIMARY KEY,   -- SHA-256 of the text
  model         TEXT NOT NULL,      -- Which embedding model was used
  embedding     BLOB NOT NULL,      -- float32[] serialized as buffer
  dimensions    INTEGER NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: transcript_index
-- Searchable index over tier-3 transcripts (faster than grep)
-- Built by DreamAgent after each cycle batch
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transcript_index (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  cycle_number  INTEGER NOT NULL,
  role          TEXT NOT NULL,
  action        TEXT NOT NULL,
  content       TEXT NOT NULL,     -- Full content (for BM25)
  content_hash  TEXT NOT NULL,     -- For dedup
  embedding     BLOB,              -- For semantic search
  created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tidx_run    ON transcript_index(run_id);
CREATE INDEX IF NOT EXISTS idx_tidx_cycle  ON transcript_index(run_id, cycle_number);
CREATE INDEX IF NOT EXISTS idx_tidx_role   ON transcript_index(role);

-- FTS5 index for BM25 full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS transcript_fts USING fts5(
  content,
  content='transcript_index',
  content_rowid='rowid'
);

-- Keep FTS in sync
CREATE TRIGGER IF NOT EXISTS trg_tidx_insert
AFTER INSERT ON transcript_index BEGIN
  INSERT INTO transcript_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS trg_tidx_delete
AFTER DELETE ON transcript_index BEGIN
  INSERT INTO transcript_fts(transcript_fts, rowid, content)
  VALUES ('delete', old.rowid, old.content);
END;

-- ────────────────────────────────────────────────────────────
-- TABLE: contradictions
-- Detected contradictions between facts
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contradictions (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  fact_a_id     TEXT NOT NULL REFERENCES facts(id),
  fact_b_id     TEXT NOT NULL REFERENCES facts(id),
  description   TEXT NOT NULL,
  resolution    TEXT,             -- How it was resolved
  resolved      INTEGER DEFAULT 0,
  detected_cycle INTEGER NOT NULL,
  resolved_cycle INTEGER,
  created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contra_run ON contradictions(run_id, resolved);

-- ────────────────────────────────────────────────────────────
-- TABLE: memory_snapshots_v2
-- Full versioned snapshots of all memory files after each dream
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_snapshots_v2 (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  dream_run_id    TEXT NOT NULL REFERENCES dream_runs(id),
  cycle_number    INTEGER NOT NULL,
  tier            INTEGER NOT NULL CHECK(tier IN (1, 2)),
  file_path       TEXT NOT NULL,
  content         TEXT NOT NULL,
  content_hash    TEXT NOT NULL,
  line_count      INTEGER NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- VIEWS (Phase 3)
-- ────────────────────────────────────────────────────────────

CREATE VIEW IF NOT EXISTS v_fact_summary AS
SELECT
  run_id,
  category,
  COUNT(*)                                      AS total,
  COUNT(CASE WHEN active=1 THEN 1 END)          AS active_count,
  AVG(CASE WHEN active=1 THEN confidence END)   AS avg_confidence,
  SUM(confirmation_count)                       AS total_confirmations
FROM facts
GROUP BY run_id, category;

CREATE VIEW IF NOT EXISTS v_dream_summary AS
SELECT
  run_id,
  COUNT(*)                    AS total_dreams,
  SUM(facts_extracted)        AS total_facts_extracted,
  SUM(contradictions_found)   AS total_contradictions,
  SUM(contradictions_resolved)AS total_resolved,
  AVG(dream_quality_score)    AS avg_quality,
  SUM(llm_cost_usd)           AS total_cost,
  MAX(cycle_number)           AS last_dream_cycle
FROM dream_runs
GROUP BY run_id;

CREATE VIEW IF NOT EXISTS v_memory_health AS
SELECT
  f.run_id,
  COUNT(DISTINCT f.id)                                    AS total_facts,
  COUNT(DISTINCT CASE WHEN f.active=1 THEN f.id END)      AS active_facts,
  COUNT(DISTINCT CASE WHEN f.confidence < 0.3 THEN f.id END) AS low_confidence_facts,
  COUNT(DISTINCT c.id)                                    AS open_contradictions,
  MAX(dr.cycle_number)                                    AS last_dream_cycle
FROM facts f
LEFT JOIN contradictions c  ON c.run_id=f.run_id AND c.resolved=0
LEFT JOIN dream_runs     dr ON dr.run_id=f.run_id
GROUP BY f.run_id;