SQL

-- ============================================================
-- AutoOrg Phase 6 Schema
-- Tool registry + tool traces + evidence packs + replay
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLE: tool_definitions
-- Manifested tools registered with the system
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_definitions (
  name TEXT PRIMARY KEY,                 -- repo.search / web.fetch / sandbox.exec
  display_name TEXT NOT NULL,
  capability_class TEXT NOT NULL CHECK(capability_class IN (
    'search','read','verify','execute','transform'
  )),
  description TEXT NOT NULL,
  input_schema_json TEXT NOT NULL,
  output_schema_json TEXT NOT NULL,
  default_timeout_ms INTEGER NOT NULL,
  default_cost_hint REAL NOT NULL DEFAULT 0,
  replayable INTEGER NOT NULL DEFAULT 1,
  dangerous INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: tool_policies
-- Per-role / per-team allowlists and limits
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_policies (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  team_id TEXT,
  role TEXT NOT NULL,
  tool_name TEXT NOT NULL REFERENCES tool_definitions(name) ON DELETE CASCADE,
  allowed INTEGER NOT NULL DEFAULT 1,
  max_calls_per_cycle INTEGER,
  max_calls_per_run INTEGER,
  require_evidence INTEGER NOT NULL DEFAULT 1,
  require_human_approval INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tool_policies_run_role
  ON tool_policies(run_id, role, team_id);

-- ────────────────────────────────────────────────────────────
-- TABLE: tool_executions
-- One row per actual tool call
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_executions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  cycle_number INTEGER NOT NULL,
  task_id TEXT,
  team_id TEXT,
  role TEXT NOT NULL,
  tool_name TEXT NOT NULL REFERENCES tool_definitions(name),
  capability_class TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','running','completed','failed','denied','timed_out','cancelled')),
  input_json TEXT NOT NULL,
  output_summary TEXT,
  artifact_path TEXT,
  duration_ms INTEGER,
  cost_usd REAL DEFAULT 0,
  source_count INTEGER DEFAULT 0,
  deterministic INTEGER NOT NULL DEFAULT 0,
  replayable INTEGER NOT NULL DEFAULT 1,
  error_text TEXT,
  started_at DATETIME,
  finished_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tool_executions_run_cycle
  ON tool_executions(run_id, cycle_number, created_at);

-- ────────────────────────────────────────────────────────────
-- TABLE: tool_artifacts
-- Source excerpts / file hits / command outputs per tool execution
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_artifacts (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES tool_executions(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK(artifact_type IN (
    'file_hit','web_page','github_issue','github_pr','stdout','stderr','json','text'
  )),
  source_uri TEXT,
  title TEXT,
  excerpt TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tool_artifacts_execution
  ON tool_artifacts(execution_id);

-- ────────────────────────────────────────────────────────────
-- TABLE: evidence_packs
-- Evidence bundles attached to task outputs / synthesis
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evidence_packs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  cycle_number INTEGER NOT NULL,
  task_id TEXT,
  team_id TEXT,
  owner_role TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('worker','team','ceo','merged')),
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','merged','archived')),
  summary TEXT NOT NULL,
  artifact_path TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  unsupported_claim_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_evidence_packs_run_cycle
  ON evidence_packs(run_id, cycle_number, created_at);

-- ────────────────────────────────────────────────────────────
-- TABLE: evidence_items
-- Individual evidence records
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evidence_items (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL REFERENCES evidence_packs(id) ON DELETE CASCADE,
  execution_id TEXT REFERENCES tool_executions(id) ON DELETE SET NULL,
  claim_text TEXT,
  source_uri TEXT,
  title TEXT,
  excerpt TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_evidence_items_pack
  ON evidence_items(pack_id);

-- ────────────────────────────────────────────────────────────
-- TABLE: verification_reports
-- Claim coverage audit for final outputs
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verification_reports (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  cycle_number INTEGER NOT NULL,
  role TEXT NOT NULL,
  task_id TEXT,
  evidence_pack_id TEXT REFERENCES evidence_packs(id),
  total_claims INTEGER NOT NULL DEFAULT 0,
  supported_claims INTEGER NOT NULL DEFAULT 0,
  unsupported_claims INTEGER NOT NULL DEFAULT 0,
  report_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_verification_reports_run_cycle
  ON verification_reports(run_id, cycle_number);

-- ────────────────────────────────────────────────────────────
-- TABLE: tool_replays
-- Replay history for debugging / benchmark reproducibility
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_replays (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES tool_executions(id) ON DELETE CASCADE,
  replay_mode TEXT NOT NULL CHECK(replay_mode IN ('artifact_only','full_rerun')),
  status TEXT NOT NULL CHECK(status IN ('started','completed','failed')),
  output_json TEXT,
  error_text TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- Feature flags
-- ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES
  ('toolRegistry', 1, 'Manifested tool registry (Phase 6)'),
  ('toolUse', 1, 'Agents can plan and use tools (Phase 6)'),
  ('toolPolicies', 1, 'Per-role / per-team tool allowlists (Phase 6)'),
  ('toolTraces', 1, 'Persist tool traces to DB + artifacts (Phase 6)'),
  ('evidencePacks', 1, 'Build evidence packs from tool outputs (Phase 6)'),
  ('sandboxExec', 1, 'Sandboxed workspace execution (Phase 6)'),
  ('externalConnectors', 1, 'GitHub/web/docs/ticket connectors (Phase 6)'),
  ('toolAwareCritic', 1, 'Critic penalizes unsupported claims (Phase 6)'),
  ('toolAwareJudge', 1, 'Judge receives verification report (Phase 6)'),
  ('replayableToolTraces', 1, 'Replay tool traces from saved artifacts (Phase 6)');