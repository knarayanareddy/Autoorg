SQL

-- ============================================================
-- AutoOrg Phase 10 Schema
-- Learning organization
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLE: learning_cycles
-- Top-level self-improvement loop executions
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_cycles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  workspace_id TEXT,
  initiated_by TEXT NOT NULL DEFAULT 'system',
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','failed','cancelled')),
  source_window_start DATETIME,
  source_window_end DATETIME,
  objective_json TEXT NOT NULL DEFAULT '{}',
  summary_json TEXT NOT NULL DEFAULT '{}',
  artifact_path TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  finished_at DATETIME
);

-- ────────────────────────────────────────────────────────────
-- TABLE: pattern_reports
-- Mined patterns from successful runs/evals/history
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pattern_reports (
  id TEXT PRIMARY KEY,
  learning_cycle_id TEXT NOT NULL REFERENCES learning_cycles(id) ON DELETE CASCADE,
  source_scope TEXT NOT NULL CHECK(source_scope IN (
    'runs','benchmarks','portfolio','billing','memory','security','combined'
  )),
  subject_key TEXT,
  artifact_path TEXT NOT NULL,
  report_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pattern_reports_cycle
  ON pattern_reports(learning_cycle_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: improvement_proposals
-- Candidate self-improvement changes
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS improvement_proposals (
  id TEXT PRIMARY KEY,
  learning_cycle_id TEXT NOT NULL REFERENCES learning_cycles(id) ON DELETE CASCADE,
  proposal_type TEXT NOT NULL CHECK(proposal_type IN (
    'prompt','policy','role','routing','memory_prune','template','adapter_distill'
  )),
  target_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN (
      'draft','simulating','simulation_failed','pending_approval','approved','rejected','released','abandoned'
    )),
  rationale_json TEXT NOT NULL DEFAULT '{}',
  candidate_artifact_path TEXT,
  expected_delta_json TEXT NOT NULL DEFAULT '{}',
  approval_id TEXT,
  simulation_run_id TEXT,
  release_artifact_path TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  released_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_improvement_proposals_cycle
  ON improvement_proposals(learning_cycle_id, proposal_type, status);

-- ────────────────────────────────────────────────────────────
-- TABLE: prompt_versions
-- Versioned prompt overlays / replacements
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  target_key TEXT NOT NULL,                     -- e.g. role:CEO / role:Critic / prompt:tool-planner
  version_label TEXT NOT NULL,
  parent_version_id TEXT REFERENCES prompt_versions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'candidate'
    CHECK(status IN ('draft','candidate','active','retired','rejected')),
  content TEXT NOT NULL,
  created_by_proposal_id TEXT REFERENCES improvement_proposals(id) ON DELETE SET NULL,
  benchmark_score REAL,
  benchmark_policy REAL,
  drift_score REAL,
  notes_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_target
  ON prompt_versions(target_key, status, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: policy_versions
-- Versioned policy payloads
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_versions (
  id TEXT PRIMARY KEY,
  target_key TEXT NOT NULL,                     -- tool_policy / action_policy / approval_policy
  version_label TEXT NOT NULL,
  parent_version_id TEXT REFERENCES policy_versions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'candidate'
    CHECK(status IN ('draft','candidate','active','retired','rejected')),
  config_json TEXT NOT NULL DEFAULT '{}',
  created_by_proposal_id TEXT REFERENCES improvement_proposals(id) ON DELETE SET NULL,
  benchmark_score REAL,
  benchmark_policy REAL,
  drift_score REAL,
  notes_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_policy_versions_target
  ON policy_versions(target_key, status, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: role_versions
-- Versioned role instructions/manifests
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_versions (
  id TEXT PRIMARY KEY,
  role_key TEXT NOT NULL,
  version_label TEXT NOT NULL,
  parent_version_id TEXT REFERENCES role_versions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'candidate'
    CHECK(status IN ('draft','candidate','active','retired','rejected')),
  manifest_json TEXT NOT NULL DEFAULT '{}',
  created_by_proposal_id TEXT REFERENCES improvement_proposals(id) ON DELETE SET NULL,
  benchmark_score REAL,
  benchmark_policy REAL,
  drift_score REAL,
  notes_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_role_versions_role
  ON role_versions(role_key, status, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: routing_versions
-- Versioned model-routing policies
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routing_versions (
  id TEXT PRIMARY KEY,
  routing_scope TEXT NOT NULL DEFAULT 'global',
  version_label TEXT NOT NULL,
  parent_version_id TEXT REFERENCES routing_versions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'candidate'
    CHECK(status IN ('draft','candidate','active','retired','rejected')),
  config_json TEXT NOT NULL DEFAULT '{}',
  created_by_proposal_id TEXT REFERENCES improvement_proposals(id) ON DELETE SET NULL,
  benchmark_score REAL,
  benchmark_policy REAL,
  cost_delta REAL,
  notes_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_routing_versions_scope
  ON routing_versions(routing_scope, status, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: memory_utility_scores
-- Utility estimates for memory artifacts/items
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_utility_scores (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  memory_path TEXT NOT NULL,
  item_hash TEXT NOT NULL,
  access_count INTEGER NOT NULL DEFAULT 0,
  citation_count INTEGER NOT NULL DEFAULT 0,
  benchmark_contribution REAL NOT NULL DEFAULT 0,
  recency_score REAL NOT NULL DEFAULT 0,
  utility_score REAL NOT NULL DEFAULT 0,
  keep_recommendation INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_memory_utility_path
  ON memory_utility_scores(workspace_id, memory_path, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: distillation_jobs
-- Export/build jobs for trace distillation
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS distillation_jobs (
  id TEXT PRIMARY KEY,
  learning_cycle_id TEXT REFERENCES learning_cycles(id) ON DELETE SET NULL,
  job_kind TEXT NOT NULL CHECK(job_kind IN ('planner','judge','router','tool_planner','critic')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','running','completed','failed','cancelled')),
  source_filter_json TEXT NOT NULL DEFAULT '{}',
  dataset_artifact_path TEXT,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  finished_at DATETIME
);

-- ────────────────────────────────────────────────────────────
-- TABLE: simulation_runs
-- Candidate-vs-baseline simulations before release
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS simulation_runs (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES improvement_proposals(id) ON DELETE CASCADE,
  suite_name TEXT NOT NULL,
  baseline_benchmark_run_id TEXT,
  candidate_benchmark_run_id TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','failed','cancelled')),
  delta_json TEXT NOT NULL DEFAULT '{}',
  artifact_path TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  finished_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_simulation_runs_proposal
  ON simulation_runs(proposal_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: rollout_decisions
-- Final release-gate decisions
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rollout_decisions (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES improvement_proposals(id) ON DELETE CASCADE,
  version_kind TEXT NOT NULL CHECK(version_kind IN ('prompt','policy','role','routing','memory_prune','adapter_distill')),
  version_ref TEXT,
  decision TEXT NOT NULL CHECK(decision IN ('approved','rejected','blocked','rolled_back')),
  benchmark_pass INTEGER NOT NULL DEFAULT 0,
  drift_pass INTEGER NOT NULL DEFAULT 0,
  approval_pass INTEGER NOT NULL DEFAULT 0,
  artifact_path TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: prompt_drift_reports
-- Drift analyses between versions
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_drift_reports (
  id TEXT PRIMARY KEY,
  target_key TEXT NOT NULL,
  from_version_id TEXT,
  to_version_id TEXT,
  drift_score REAL NOT NULL DEFAULT 0,
  regression_risk REAL NOT NULL DEFAULT 0,
  report_json TEXT NOT NULL DEFAULT '{}',
  artifact_path TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prompt_drift_target
  ON prompt_drift_reports(target_key, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: learning_lineage
-- Parent-child graph for versions/proposals/releases
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_lineage (
  id TEXT PRIMARY KEY,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  parent_entity_kind TEXT,
  parent_entity_id TEXT,
  relation TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_learning_lineage_entity
  ON learning_lineage(entity_kind, entity_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- Feature flags
-- ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES
  ('learningLoop', 1, 'Periodic learning/self-improvement loop (Phase 10)'),
  ('patternMining', 1, 'Mine patterns from successful runs and benchmarks (Phase 10)'),
  ('promptOptimization', 1, 'Generate prompt revisions from patterns (Phase 10)'),
  ('policyOptimization', 1, 'Generate policy revisions from patterns (Phase 10)'),
  ('roleEvolution', 1, 'Generate role revisions from benchmark evidence (Phase 10)'),
  ('memoryUtilityPruning', 1, 'Utility-based memory pruning (Phase 10)'),
  ('routingOptimization', 1, 'Cost-quality routing optimization (Phase 10)'),
  ('adapterDistillation', 1, 'Export high-quality traces for distillation (Phase 10)'),
  ('simulateBeforeRollout', 1, 'Benchmark simulation before activating changes (Phase 10)'),
  ('selfImprovementApproval', 1, 'Approval-gated rollout of self-modifications (Phase 10)'),
  ('promptDriftGuard', 1, 'Detect harmful drift before release (Phase 10)'),
  ('learningLineage', 1, 'Track ancestry of improvements (Phase 10)');