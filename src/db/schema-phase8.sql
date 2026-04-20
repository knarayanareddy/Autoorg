-- ============================================================
-- AutoOrg Phase 8 Schema
-- Portfolio orchestration
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLE: portfolio_runs
-- One top-level portfolio execution over a mission
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolio_runs (
  id TEXT PRIMARY KEY,
  mission_hash TEXT NOT NULL,
  mission_summary TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('mission','benchmark_seeded','tournament')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','failed','cancelled')),
  initial_budget_usd REAL NOT NULL DEFAULT 0,
  remaining_budget_usd REAL NOT NULL DEFAULT 0,
  round_limit INTEGER NOT NULL DEFAULT 3,
  top_k_survive INTEGER NOT NULL DEFAULT 2,
  final_variant_id TEXT,
  final_artifact_path TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  finished_at DATETIME
);

-- ────────────────────────────────────────────────────────────
-- TABLE: portfolio_variants
-- Competing org variants in one portfolio
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolio_variants (
  id TEXT PRIMARY KEY,
  portfolio_run_id TEXT NOT NULL REFERENCES portfolio_runs(id) ON DELETE CASCADE,
  variant_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  constitution_variant TEXT NOT NULL,
  template_variant TEXT NOT NULL,
  role_mix_json TEXT NOT NULL DEFAULT '{}',
  model_map_json TEXT NOT NULL DEFAULT '{}',
  branch_name TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  prior_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','running','completed','eliminated','failed','quarantined','winner')),
  allocated_budget_usd REAL NOT NULL DEFAULT 0,
  spent_budget_usd REAL NOT NULL DEFAULT 0,
  latest_score REAL,
  latest_groundedness REAL,
  latest_policy_compliance REAL,
  latest_cost_usd REAL,
  latest_latency_ms REAL,
  latest_autoorg_run_id TEXT,
  latest_output_path TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: portfolio_rounds
-- Capital allocation rounds within a portfolio run
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolio_rounds (
  id TEXT PRIMARY KEY,
  portfolio_run_id TEXT NOT NULL REFERENCES portfolio_runs(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','failed','cancelled')),
  objective_snapshot_json TEXT NOT NULL DEFAULT '{}',
  started_at DATETIME NOT NULL DEFAULT (datetime('now')),
  finished_at DATETIME
);

-- ────────────────────────────────────────────────────────────
-- TABLE: portfolio_variant_runs
-- One child AutoOrg execution for a variant in a round
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolio_variant_runs (
  id TEXT PRIMARY KEY,
  portfolio_round_id TEXT NOT NULL REFERENCES portfolio_rounds(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES portfolio_variants(id) ON DELETE CASCADE,
  autoorg_run_id TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','failed','cancelled')),
  output_path TEXT,
  evidence_pack_id TEXT,
  report_path TEXT,
  score REAL DEFAULT 0,
  groundedness REAL DEFAULT 0,
  novelty REAL DEFAULT 0,
  consistency REAL DEFAULT 0,
  mission_alignment REAL DEFAULT 0,
  policy_compliance REAL DEFAULT 1,
  cost_usd REAL DEFAULT 0,
  latency_ms REAL DEFAULT 0,
  tool_calls INTEGER DEFAULT 0,
  security_findings INTEGER DEFAULT 0,
  unsupported_claims INTEGER DEFAULT 0,
  broken_provenance_links INTEGER DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  finished_at DATETIME
);

-- ────────────────────────────────────────────────────────────
-- TABLE: portfolio_allocations
-- Budget reallocation decisions
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolio_allocations (
  id TEXT PRIMARY KEY,
  portfolio_run_id TEXT NOT NULL REFERENCES portfolio_runs(id) ON DELETE CASCADE,
  portfolio_round_id TEXT REFERENCES portfolio_rounds(id) ON DELETE SET NULL,
  variant_id TEXT NOT NULL REFERENCES portfolio_variants(id) ON DELETE CASCADE,
  allocation_type TEXT NOT NULL CHECK(allocation_type IN ('seed','rebalance','bonus','cut','eliminate')),
  amount_usd REAL NOT NULL,
  rationale_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: judge_council_votes
-- Ensemble votes on variants / outputs / syntheses
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS judge_council_votes (
  id TEXT PRIMARY KEY,
  portfolio_run_id TEXT NOT NULL REFERENCES portfolio_runs(id) ON DELETE CASCADE,
  portfolio_round_id TEXT REFERENCES portfolio_rounds(id) ON DELETE SET NULL,
  subject_kind TEXT NOT NULL CHECK(subject_kind IN ('variant_output','match','synthesis')),
  subject_ref TEXT NOT NULL,
  judge_name TEXT NOT NULL,
  judge_model TEXT,
  voted_variant_id TEXT,
  score REAL NOT NULL DEFAULT 0,
  reasoning_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: tournament_matches
-- Pairwise / bracket comparisons
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_matches (
  id TEXT PRIMARY KEY,
  portfolio_run_id TEXT NOT NULL REFERENCES portfolio_runs(id) ON DELETE CASCADE,
  portfolio_round_id TEXT REFERENCES portfolio_rounds(id) ON DELETE SET NULL,
  variant_a_id TEXT NOT NULL REFERENCES portfolio_variants(id) ON DELETE CASCADE,
  variant_b_id TEXT NOT NULL REFERENCES portfolio_variants(id) ON DELETE CASCADE,
  winner_variant_id TEXT REFERENCES portfolio_variants(id) ON DELETE SET NULL,
  referee_report_json TEXT NOT NULL DEFAULT '{}',
  artifact_path TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: portfolio_exchanges
-- Cross-org artifact exchange requests
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolio_exchanges (
  id TEXT PRIMARY KEY,
  portfolio_run_id TEXT NOT NULL REFERENCES portfolio_runs(id) ON DELETE CASCADE,
  from_variant_id TEXT NOT NULL REFERENCES portfolio_variants(id) ON DELETE CASCADE,
  to_variant_id TEXT NOT NULL REFERENCES portfolio_variants(id) ON DELETE CASCADE,
  artifact_path TEXT NOT NULL,
  artifact_sha256 TEXT,
  exchange_type TEXT NOT NULL CHECK(exchange_type IN ('evidence','draft','plan','memory_note')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','blocked','delivered','failed')),
  quarantine_report_json TEXT NOT NULL DEFAULT '{}',
  delivered_path TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  delivered_at DATETIME
);

-- ────────────────────────────────────────────────────────────
-- TABLE: quarantined_artifacts
-- Artifacts held or sanitized before sharing
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quarantined_artifacts (
  id TEXT PRIMARY KEY,
  exchange_id TEXT NOT NULL REFERENCES portfolio_exchanges(id) ON DELETE CASCADE,
  original_artifact_path TEXT NOT NULL,
  quarantined_artifact_path TEXT,
  status TEXT NOT NULL DEFAULT 'held'
    CHECK(status IN ('held','sanitized','released','blocked')),
  findings_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: portfolio_syntheses
-- Best-of-N final synthesis artifacts
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolio_syntheses (
  id TEXT PRIMARY KEY,
  portfolio_run_id TEXT NOT NULL REFERENCES portfolio_runs(id) ON DELETE CASCADE,
  portfolio_round_id TEXT REFERENCES portfolio_rounds(id) ON DELETE SET NULL,
  synthesis_type TEXT NOT NULL CHECK(synthesis_type IN ('best_of_n','merged','winner_take_all')),
  winning_variant_id TEXT REFERENCES portfolio_variants(id) ON DELETE SET NULL,
  source_variant_ids_json TEXT NOT NULL DEFAULT '[]',
  artifact_path TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: failure_containment_events
-- Variant isolation / quarantine / kill-switch events
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS failure_containment_events (
  id TEXT PRIMARY KEY,
  portfolio_run_id TEXT NOT NULL REFERENCES portfolio_runs(id) ON DELETE CASCADE,
  variant_id TEXT REFERENCES portfolio_variants(id) ON DELETE SET NULL,
  severity TEXT NOT NULL CHECK(severity IN ('info','warn','error','critical')),
  category TEXT NOT NULL CHECK(category IN (
    'budget_exhausted',
    'security_findings',
    'workspace_corruption',
    'crash_loop',
    'quarantined',
    'killed',
    'approval_bypass_attempt'
  )),
  summary TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: portfolio_priors
-- Optional priors from benchmark history
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolio_priors (
  id TEXT PRIMARY KEY,
  variant_key TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('benchmark_leaderboard','manual','historical')),
  prior_score REAL NOT NULL DEFAULT 0,
  prior_policy REAL NOT NULL DEFAULT 1,
  prior_cost REAL NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- Feature flags
-- ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES
  ('portfolioOrchestration', 1, 'Multiple concurrent org variants on one mission (Phase 8)'),
  ('portfolioAllocator', 1, 'Capital routing across variants (Phase 8)'),
  ('judgeCouncil', 1, 'Council voting over variants (Phase 8)'),
  ('tournamentMode', 1, 'Tournament bracket over variants (Phase 8)'),
  ('crossOrgQuarantine', 1, 'Cross-org artifact exchange through quarantine (Phase 8)'),
  ('bestOfNSynthesis', 1, 'Final synthesis from top variants (Phase 8)'),
  ('branchPerOrg', 1, 'Git branch/worktree isolation per variant (Phase 8)'),
  ('failureContainment', 1, 'Variant failure boundaries and kill-switches (Phase 8)'),
  ('portfolioDashboard', 1, 'Portfolio/capital allocation UI (Phase 8)');
