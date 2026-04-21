-- ============================================================
-- AutoOrg Database Schema
-- Phase 0: SQLite (migrates to Neo4j in Phase 4 for graph layer)
-- ============================================================

PRAGMA journal_mode=WAL;       -- Better concurrent read performance
PRAGMA foreign_keys=ON;        -- Enforce referential integrity
PRAGMA synchronous=NORMAL;     -- Balance between safety and speed

-- ────────────────────────────────────────────────────────────
-- TABLE: runs
-- One row per AutoOrg execution session
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runs (
  id            TEXT PRIMARY KEY,          -- nanoid, e.g. "run_v4j8k2"
  org_md_hash   TEXT NOT NULL,             -- SHA-256 of org.md at run start
  org_md_path   TEXT NOT NULL DEFAULT 'org.md',
  started_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  ended_at      DATETIME,
  status        TEXT NOT NULL DEFAULT 'running'
                  CHECK(status IN ('running','completed','failed','stopped')),
  total_cycles  INTEGER DEFAULT 0,
  best_score    REAL DEFAULT 0.0,
  stop_reason   TEXT,                      -- "max_cycles"|"plateau"|"budget"|"target"|"manual"
  total_cost_usd REAL DEFAULT 0.0,
  config_json   TEXT NOT NULL DEFAULT '{}'  -- snapshot of parsed org.md config
);

-- ────────────────────────────────────────────────────────────
-- TABLE: cycles
-- One row per orchestrator loop iteration
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cycles (
  id              TEXT PRIMARY KEY,         -- nanoid
  run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  cycle_number    INTEGER NOT NULL,
  started_at      DATETIME NOT NULL DEFAULT (datetime('now')),
  ended_at        DATETIME,
  duration_ms     INTEGER,
  
  -- Ratchet scores (null until judge runs)
  score_groundedness  REAL,
  score_novelty       REAL,
  score_consistency   REAL,
  score_alignment     REAL,
  score_composite     REAL,
  
  -- Ratchet decision
  decision        TEXT CHECK(decision IN ('COMMIT','REVERT','DISQUALIFIED','TIMEOUT','ERROR')),
  decision_reason TEXT,
  
  -- Git state
  git_commit_hash TEXT,                     -- null if REVERT
  git_baseline_hash TEXT,                   -- hash we're comparing against
  
  -- Cost tracking
  cycle_cost_usd  REAL DEFAULT 0.0,
  tokens_used     INTEGER DEFAULT 0,
  
  -- Proposal
  proposal_path   TEXT,                     -- path to workspace/proposals/cycle_N.md
  proposal_summary TEXT,
  
  -- autoDream ran this cycle?
  dream_ran       INTEGER DEFAULT 0,        -- boolean
  
  UNIQUE(run_id, cycle_number)
);

CREATE INDEX IF NOT EXISTS idx_cycles_run_id ON cycles(run_id);
CREATE INDEX IF NOT EXISTS idx_cycles_score ON cycles(score_composite DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: agent_executions
-- One row per agent invocation per cycle
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_executions (
  id            TEXT PRIMARY KEY,
  cycle_id      TEXT NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  run_id        TEXT NOT NULL,
  
  agent_role    TEXT NOT NULL,              -- CEO|Engineer|Critic|etc.
  phase         INTEGER NOT NULL,           -- 1=assign,2=work,3=synthesize,4=judge
  
  started_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  ended_at      DATETIME,
  duration_ms   INTEGER,
  
  -- LLM details
  provider      TEXT NOT NULL,              -- anthropic|openai|ollama|groq|etc.
  model         TEXT NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  cost_usd      REAL DEFAULT 0.0,
  
  -- I/O
  system_prompt_hash TEXT,                  -- SHA-256 of system prompt used
  input_tokens  INTEGER DEFAULT 0,
  output_text   TEXT,                       -- full agent output (stored for audit)
  
  -- Status
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK(status IN ('pending','running','completed','failed','timeout')),
  error_message TEXT,
  retry_count   INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_agent_exec_cycle ON agent_executions(cycle_id);
CREATE INDEX IF NOT EXISTS idx_agent_exec_role ON agent_executions(agent_role);

-- ────────────────────────────────────────────────────────────
-- TABLE: mailbox_messages
-- Persistent log of all inter-agent messages
-- (Files in /mailbox/ are ephemeral; this table is the audit log)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mailbox_messages (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  cycle_id      TEXT NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  
  from_agent    TEXT NOT NULL,
  to_agent      TEXT NOT NULL,
  message_type  TEXT NOT NULL,              -- 'task'|'reply'|'objection'|'directive'
  
  content       TEXT NOT NULL,              -- full JSON content
  created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  read_at       DATETIME,
  
  -- For Critic objections
  objection_severity TEXT CHECK(objection_severity IN ('BLOCKER','MAJOR','MINOR',NULL)),
  objection_resolved INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mailbox_cycle ON mailbox_messages(cycle_id);
CREATE INDEX IF NOT EXISTS idx_mailbox_to_agent ON mailbox_messages(to_agent);

-- ────────────────────────────────────────────────────────────
-- TABLE: memory_snapshots
-- Snapshot of MEMORY.md tier-1 index after each autoDream run
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_snapshots (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  cycle_number    INTEGER NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
  
  memory_index_content TEXT NOT NULL,       -- full content of MEMORY.md at this point
  facts_summary   TEXT,                     -- what changed this dream cycle
  contradictions_removed INTEGER DEFAULT 0,
  facts_added     INTEGER DEFAULT 0,
  facts_updated   INTEGER DEFAULT 0
);

-- ────────────────────────────────────────────────────────────
-- TABLE: score_history
-- Denormalized score history for quick charting (Phase 0 UI)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS score_history (
  run_id        TEXT NOT NULL,
  cycle_number  INTEGER NOT NULL,
  composite     REAL NOT NULL,
  decision      TEXT NOT NULL,
  recorded_at   DATETIME NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (run_id, cycle_number)
);

-- ────────────────────────────────────────────────────────────
-- TABLE: kg_nodes
-- Knowledge Graph Nodes (Phase 4 consolidated)
-- ────────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_kgn_run ON kg_nodes(run_id);

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

CREATE INDEX IF NOT EXISTS idx_kge_run ON kg_edges(run_id);

-- ────────────────────────────────────────────────────────────
-- TABLE: facts
-- Structured Fact Store (Phase 3-5 consolidated)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facts (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  statement       TEXT NOT NULL,
  category        TEXT NOT NULL CHECK(category IN (
    'validated_decision', 'failed_approach', 'domain_knowledge',
    'pattern', 'anti_pattern', 'constraint', 'agent_behavior'
  )),
  source_cycle    INTEGER NOT NULL,
  source_type     TEXT NOT NULL,
  evidence        TEXT,
  confidence      REAL NOT NULL DEFAULT 0.5,
  confirmation_count INTEGER DEFAULT 1,
  contradiction_count INTEGER DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1,
  superseded_by   TEXT REFERENCES facts(id),
  last_confirmed  INTEGER,
  embedding       BLOB,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_facts_run ON facts(run_id);

CREATE TABLE IF NOT EXISTS contradictions (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  fact_a_id     TEXT NOT NULL REFERENCES facts(id),
  fact_b_id     TEXT NOT NULL REFERENCES facts(id),
  description   TEXT NOT NULL,
  resolution    TEXT,
  resolved      INTEGER DEFAULT 0,
  detected_cycle INTEGER NOT NULL,
  resolved_cycle INTEGER,
  created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: llm_providers & llm_models (Phase 15 consolidated)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS llm_providers (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  provider_type   TEXT NOT NULL,
  base_url        TEXT,
  api_key         TEXT,
  is_enabled      INTEGER DEFAULT 1,
  is_default      INTEGER DEFAULT 0,
  metadata_json   TEXT DEFAULT '{}',
  created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS llm_models (
  id              TEXT PRIMARY KEY,
  provider_id     TEXT NOT NULL REFERENCES llm_providers(id) ON DELETE CASCADE,
  model_name      TEXT NOT NULL,
  alias           TEXT,
  context_window  INTEGER,
  is_active       INTEGER DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: benchmark suite (Phase 7 consolidated)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS benchmark_suites (
  id TEXT PRIMARY KEY,
  suite_name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS benchmark_cases (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL REFERENCES benchmark_suites(id) ON DELETE CASCADE,
  case_name TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard','stress')),
  org_path TEXT NOT NULL,
  constitution_path TEXT NOT NULL,
  gold_path TEXT,
  case_config_json TEXT NOT NULL DEFAULT '{}',
  acceptance_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS benchmark_runs (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL REFERENCES benchmark_suites(id) ON DELETE CASCADE,
  run_label TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('manual','ci','ab_test','bakeoff','replay')),
  git_head TEXT,
  started_at DATETIME NOT NULL DEFAULT (datetime('now')),
  finished_at DATETIME,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed','cancelled')),
  summary_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS benchmark_attempts (
  id TEXT PRIMARY KEY,
  benchmark_run_id TEXT NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL REFERENCES benchmark_cases(id) ON DELETE CASCADE,
  autoorg_run_id TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed','cancelled')),
  started_at DATETIME NOT NULL DEFAULT (datetime('now')),
  finished_at DATETIME
);

CREATE TABLE IF NOT EXISTS benchmark_metrics (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES benchmark_attempts(id) ON DELETE CASCADE,
  score REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: hardening & operational tables (Phase 5/5.1 consolidated)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  name            TEXT NOT NULL,
  lead_role       TEXT NOT NULL,
  mission         TEXT NOT NULL,
  active          INTEGER NOT NULL DEFAULT 1,
  created_cycle   INTEGER NOT NULL,
  parent_team_id  TEXT REFERENCES teams(id),
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS team_members (
  id          TEXT PRIMARY KEY,
  team_id      TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approvals (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  cycle_number    INTEGER,
  approval_type   TEXT NOT NULL CHECK(approval_type IN ('commit','push','merge','ultraplan','daemon_action','job')),
  subject         TEXT NOT NULL,
  requested_by    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','expired')),
  summary         TEXT NOT NULL,
  details_json    TEXT NOT NULL DEFAULT '{}',
  requested_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  decided_at      DATETIME,
  decided_by      TEXT
);

CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY,
  approval_id TEXT NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK(action_type IN ('commit','push','merge','ultraplan_apply','job')),
  status TEXT NOT NULL DEFAULT 'staged' CHECK(status IN ('staged','approved','materialized','rejected','expired','failed')),
  artifact_path TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  materialized_at DATETIME
);

CREATE TABLE IF NOT EXISTS daemon_state (
  id                TEXT PRIMARY KEY,
  instance_name     TEXT NOT NULL DEFAULT 'default',
  status            TEXT NOT NULL DEFAULT 'stopped' CHECK(status IN ('starting','running','stopped','error','paused')),
  pid               INTEGER,
  last_heartbeat    DATETIME,
  current_run_id    TEXT,
  metadata_json     TEXT NOT NULL DEFAULT '{}',
  updated_at        DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: memory infrastructure
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS embeddings_cache (
  content_hash  TEXT PRIMARY KEY,
  model         TEXT NOT NULL,
  embedding     BLOB NOT NULL,
  dimensions    INTEGER NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transcript_index (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  cycle_number  INTEGER NOT NULL,
  role          TEXT NOT NULL,
  action        TEXT NOT NULL,
  content       TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  embedding     BLOB,
  created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: feature_flags
-- Runtime feature flag state
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_name     TEXT PRIMARY KEY,
  enabled       INTEGER NOT NULL DEFAULT 0,
  description   TEXT,
  updated_at    DATETIME DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- FEATURE FLAGS (Sync Phase 5/5.1/7/15)
-- ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES
  ('knowledgeGraph', 0, 'Knowledge Graph extraction and storage (Phase 4)'),
  ('factStore', 1, 'Structured Tier-2 memory fact store (Phase 3)'),
  ('coordinatorHierarchy', 1, 'CEO -> Team leads -> workers hierarchy (Phase 5)'),
  ('daemonMode', 1, 'Persistent background daemon (Phase 5)'),
  ('benchmarkLab', 1, 'Benchmark suite execution (Phase 7)'),
  ('llmRegistry', 1, 'Dynamic LLM provider configuration (Phase 15)');

-- ────────────────────────────────────────────────────────────
-- TABLE: tool engine (Shadow Schema)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_definitions (
  name                TEXT PRIMARY KEY,
  display_name        TEXT NOT NULL,
  capability_class    TEXT NOT NULL,
  description         TEXT NOT NULL,
  input_schema_json   TEXT NOT NULL,
  output_schema_json  TEXT NOT NULL,
  default_timeout_ms  INTEGER DEFAULT 30000,
  default_cost_hint   REAL DEFAULT 0,
  replayable          INTEGER DEFAULT 1,
  dangerous           INTEGER DEFAULT 0,
  updated_at          DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tool_executions (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  cycle_number    INTEGER NOT NULL,
  role            TEXT NOT NULL,
  tool_name       TEXT NOT NULL REFERENCES tool_definitions(name),
  input_json      TEXT NOT NULL,
  output_json     TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','failed','timeout')),
  cost_usd        REAL DEFAULT 0,
  duration_ms     INTEGER,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tool_exec_run ON tool_executions(run_id);

-- ────────────────────────────────────────────────────────────
-- TABLE: security monitoring
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_findings (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  cycle_number    INTEGER,
  level           TEXT NOT NULL CHECK(level IN ('info','warn','error','critical')),
  finding_type    TEXT NOT NULL,
  description     TEXT NOT NULL,
  mitigation      TEXT,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_security_run ON security_findings(run_id);

-- ────────────────────────────────────────────────────────────
-- TABLE: interview engine
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interview_sessions (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  agent_role      TEXT NOT NULL,
  cycle_id        TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
  turns           TEXT NOT NULL DEFAULT '[]',
  created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- VIEWS (Harmonized)
-- ────────────────────────────────────────────────────────────
CREATE VIEW IF NOT EXISTS v_fact_summary AS
SELECT
  run_id,
  category,
  COUNT(*)                                      AS total,
  COUNT(CASE WHEN active=1 THEN 1 END)          AS active_count,
  AVG(CASE WHEN active=1 THEN confidence END)   AS avg_confidence
FROM facts
GROUP BY run_id, category;

CREATE VIEW IF NOT EXISTS v_cycle_summary AS
SELECT
  c.run_id,
  c.cycle_number,
  c.score_composite,
  c.decision,
  c.duration_ms,
  c.cycle_cost_usd,
  COUNT(ae.id) as agent_count,
  SUM(ae.cost_usd) as total_agent_cost
FROM cycles c
LEFT JOIN agent_executions ae ON ae.cycle_id = c.id
GROUP BY c.id
ORDER BY c.cycle_number;

CREATE VIEW IF NOT EXISTS v_run_progress AS
SELECT
  r.id as run_id,
  r.started_at,
  r.status,
  r.total_cycles,
  r.best_score,
  r.total_cost_usd,
  COUNT(DISTINCT c.id) as cycles_completed,
  AVG(c.score_composite) as avg_score
FROM runs r
LEFT JOIN cycles c ON c.run_id = r.id
GROUP BY r.id;
