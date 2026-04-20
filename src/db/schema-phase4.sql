-- ============================================================
-- AutoOrg Phase 4 Schema
-- Knowledge Graph storage (SQLite fallback when Neo4j/Kuzu unavailable)
-- ============================================================

-- Entity nodes
CREATE TABLE IF NOT EXISTS kg_nodes (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  label           TEXT NOT NULL,
  node_type       TEXT NOT NULL,
  properties      TEXT NOT NULL DEFAULT '{}',
  source_text     TEXT,
  confidence      REAL DEFAULT 0.5,
  canonical_form  TEXT,
  embedding       BLOB,
  created_at      DATETIME DEFAULT (datetime('now')),
  updated_at      DATETIME DEFAULT (datetime('now'))
);

-- Relationships
CREATE TABLE IF NOT EXISTS kg_edges (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  from_node_id    TEXT NOT NULL REFERENCES kg_nodes(id),
  to_node_id      TEXT NOT NULL REFERENCES kg_nodes(id),
  relationship    TEXT NOT NULL,
  properties      TEXT DEFAULT '{}',
  confidence      REAL DEFAULT 0.5,
  source_text     TEXT,
  created_at      DATETIME DEFAULT (datetime('now')),
  updated_at      DATETIME DEFAULT (datetime('now'))
);

-- Claims grounding
CREATE TABLE IF NOT EXISTS kg_claims (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  cycle_number    INTEGER NOT NULL,
  agent_role      TEXT NOT NULL,
  claim_text      TEXT NOT NULL,
  grounding_score REAL,
  supporting_nodes TEXT DEFAULT '[]',
  supporting_edges TEXT DEFAULT '[]',
  created_at      DATETIME DEFAULT (datetime('now'))
);

-- Extraction logs
CREATE TABLE IF NOT EXISTS kg_extractions (
  id                TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL,
  extraction_type   TEXT NOT NULL,
  source_hash       TEXT NOT NULL,
  nodes_extracted   INTEGER DEFAULT 0,
  edges_extracted   INTEGER DEFAULT 0,
  cost_usd          REAL DEFAULT 0,
  duration_ms       INTEGER,
  started_at        DATETIME DEFAULT (datetime('now')),
  ended_at          DATETIME
);

-- Entity aliases
CREATE TABLE IF NOT EXISTS kg_entity_aliases (
  id              TEXT PRIMARY KEY,
  canonical_node_id TEXT NOT NULL REFERENCES kg_nodes(id),
  alias           TEXT NOT NULL,
  created_at      DATETIME DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_kgn_run ON kg_nodes(run_id);
CREATE INDEX IF NOT EXISTS idx_kge_run ON kg_edges(run_id);
CREATE INDEX IF NOT EXISTS idx_kgc_run ON kg_claims(run_id, cycle_number);
