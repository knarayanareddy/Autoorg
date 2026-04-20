-- ============================================================
-- AutoOrg Phase 12 Schema: The Learning Organization
-- ============================================================

-- Track Meta-Learning Cycles
CREATE TABLE IF NOT EXISTS learning_cycles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  workspace_id TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
  summary_json TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME
);

-- Mined patterns from historical runs
CREATE TABLE IF NOT EXISTS pattern_reports (
  id TEXT PRIMARY KEY,
  learning_cycle_id TEXT REFERENCES learning_cycles(id) ON DELETE CASCADE,
  report_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Self-Improvement Proposals (Prompt/Policy changes)
CREATE TABLE IF NOT EXISTS improvement_proposals (
  id TEXT PRIMARY KEY,
  learning_cycle_id TEXT REFERENCES learning_cycles(id) ON DELETE CASCADE,
  proposal_type TEXT NOT NULL CHECK(proposal_type IN ('prompt','policy','role','routing')),
  target_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','simulating','pending_approval','approved','rejected','released')),
  rationale_json TEXT NOT NULL,
  candidate_artifact_path TEXT,
  approval_id TEXT,
  simulation_run_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  released_at DATETIME
);

-- Version Control for the Organization's instructions
CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  target_key TEXT NOT NULL, -- e.g. 'role:CEO'
  version_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate','active','retired','rejected')),
  content TEXT NOT NULL,
  proposal_id TEXT REFERENCES improvement_proposals(id),
  parent_version_id TEXT,
  benchmark_score REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Lineage graph for self-improvement
CREATE TABLE IF NOT EXISTS learning_lineage (
  id TEXT PRIMARY KEY,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  parent_entity_id TEXT,
  relation TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Simulation runs for A/B testing
CREATE TABLE IF NOT EXISTS simulation_runs (
  id TEXT PRIMARY KEY,
  proposal_id TEXT REFERENCES improvement_proposals(id),
  baseline_score REAL,
  candidate_score REAL,
  delta_json TEXT DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
