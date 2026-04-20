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
-- TABLE: knowledge_graph_nodes
-- Flat representation of the graph (Phase 0-3, Neo4j in Phase 4)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_graph_nodes (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  node_type     TEXT NOT NULL,              -- 'entity'|'concept'|'constraint'|'relationship'
  label         TEXT NOT NULL,
  properties    TEXT NOT NULL DEFAULT '{}', -- JSON
  embedding     BLOB,                       -- float32 array (for vector search in Phase 4)
  created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  source_chunk  TEXT                        -- which chunk of seed material spawned this
);

CREATE INDEX IF NOT EXISTS idx_kgn_run ON knowledge_graph_nodes(run_id);
CREATE INDEX IF NOT EXISTS idx_kgn_type ON knowledge_graph_nodes(node_type);

CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  from_node_id  TEXT NOT NULL REFERENCES knowledge_graph_nodes(id),
  to_node_id    TEXT NOT NULL REFERENCES knowledge_graph_nodes(id),
  relationship  TEXT NOT NULL,              -- 'RELATES_TO'|'SUPPORTS'|'CONTRADICTS'|etc.
  weight        REAL DEFAULT 1.0,
  properties    TEXT DEFAULT '{}',
  created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_kge_from ON knowledge_graph_edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_kge_to ON knowledge_graph_edges(to_node_id);

-- ────────────────────────────────────────────────────────────
-- TABLE: feature_flags
-- Runtime feature flag state (overrides config/feature-flags.ts)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_name     TEXT PRIMARY KEY,
  enabled       INTEGER NOT NULL DEFAULT 0,  -- boolean
  description   TEXT,
  updated_at    DATETIME DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: system_prompts
-- Versioned system prompt storage (deduped by hash)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_prompts (
  hash          TEXT PRIMARY KEY,           -- SHA-256 of the prompt content
  role          TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  content       TEXT NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- VIEWS
-- ────────────────────────────────────────────────────────────

CREATE VIEW IF NOT EXISTS v_cycle_summary AS
SELECT
  c.run_id,
  c.cycle_number,
  c.score_composite,
  c.decision,
  c.duration_ms,
  c.cycle_cost_usd,
  c.dream_ran,
  COUNT(ae.id) as agent_count,
  SUM(ae.cost_usd) as total_agent_cost,
  c.proposal_summary
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
  COUNT(CASE WHEN c.decision = 'COMMIT' THEN 1 END) as commits,
  COUNT(CASE WHEN c.decision = 'REVERT' THEN 1 END) as reverts,
  AVG(c.score_composite) as avg_score
FROM runs r
LEFT JOIN cycles c ON c.run_id = r.id
GROUP BY r.id;
