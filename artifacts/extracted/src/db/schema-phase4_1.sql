SQL

-- ============================================================
-- AutoOrg Phase 4.1 Hardening
-- Deterministic groundedness + graph snapshots + export support
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLE: graph_snapshots
-- Versioned snapshots of graph state per build
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS graph_snapshots (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  build_id      TEXT NOT NULL,
  label         TEXT NOT NULL,           -- e.g. "initial", "dream_cycle_10"
  node_count    INTEGER DEFAULT 0,
  edge_count    INTEGER DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_graph_snapshots_run ON graph_snapshots(run_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: graph_snapshot_nodes
-- Node state at snapshot time
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS graph_snapshot_nodes (
  snapshot_id     TEXT NOT NULL REFERENCES graph_snapshots(id) ON DELETE CASCADE,
  node_id         TEXT NOT NULL,
  label           TEXT NOT NULL,
  node_type       TEXT NOT NULL,
  properties_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (snapshot_id, node_id)
);

-- ────────────────────────────────────────────────────────────
-- TABLE: graph_snapshot_edges
-- Edge state at snapshot time
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS graph_snapshot_edges (
  snapshot_id     TEXT NOT NULL REFERENCES graph_snapshots(id) ON DELETE CASCADE,
  edge_id         TEXT NOT NULL,
  from_node_id    TEXT NOT NULL,
  to_node_id      TEXT NOT NULL,
  rel_type        TEXT NOT NULL,
  weight          REAL DEFAULT 1.0,
  properties_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (snapshot_id, edge_id)
);

-- ────────────────────────────────────────────────────────────
-- TABLE: groundedness_reports
-- Deterministic groundedness validation records
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groundedness_reports (
  id                 TEXT PRIMARY KEY,
  run_id             TEXT NOT NULL,
  cycle_number       INTEGER NOT NULL,
  role               TEXT NOT NULL,            -- Engineer | CEO | Judge
  total_claims       INTEGER NOT NULL,
  cited_claims       INTEGER NOT NULL,
  valid_cited_claims INTEGER NOT NULL,
  invalid_cited_claims INTEGER NOT NULL,
  uncited_claims     INTEGER NOT NULL,
  valid_coverage     REAL NOT NULL,            -- valid_cited_claims / total_claims
  citation_coverage  REAL NOT NULL,            -- cited_claims / total_claims
  invalid_refs_json  TEXT NOT NULL DEFAULT '[]',
  uncited_examples_json TEXT NOT NULL DEFAULT '[]',
  created_at         DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_groundedness_run_cycle
  ON groundedness_reports(run_id, cycle_number, role);

-- ────────────────────────────────────────────────────────────
-- Additional Phase 4.1 feature flags
-- ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES
  ('deterministicGroundedness', 1, 'Deterministic graph citation validation (Phase 4.1)'),
  ('graphSnapshots',           1, 'Snapshot graph after each build/update (Phase 4.1)'),
  ('graphDiffs',               1, 'Graph diff between snapshots/builds (Phase 4.1)'),
  ('graphExport',              1, 'Export graph as JSON/GraphML (Phase 4.1)'),
  ('graphSearchUi',            1, 'Search bar in graph dashboard (Phase 4.1)');