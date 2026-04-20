SQL

-- ============================================================
-- AutoOrg Phase 7 Schema
-- Benchmark lab + regression evals + replay + calibration
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLE: benchmark_suites
-- Named groups of benchmark cases
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS benchmark_suites (
  id TEXT PRIMARY KEY,
  suite_name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: benchmark_cases
-- Each benchmark scenario
-- ────────────────────────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS idx_benchmark_cases_suite
  ON benchmark_cases(suite_id, enabled);

-- ────────────────────────────────────────────────────────────
-- TABLE: benchmark_runs
-- One top-level suite execution
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS benchmark_runs (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL REFERENCES benchmark_suites(id) ON DELETE CASCADE,
  run_label TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('manual','ci','ab_test','bakeoff','replay')),
  git_head TEXT,
  orchestrator_version TEXT,
  constitution_variant TEXT,
  template_variant TEXT,
  model_map_json TEXT NOT NULL DEFAULT '{}',
  started_at DATETIME NOT NULL DEFAULT (datetime('now')),
  finished_at DATETIME,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed','cancelled')),
  summary_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_benchmark_runs_suite
  ON benchmark_runs(suite_id, started_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: benchmark_attempts
-- One case executed within a benchmark run
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS benchmark_attempts (
  id TEXT PRIMARY KEY,
  benchmark_run_id TEXT NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL REFERENCES benchmark_cases(id) ON DELETE CASCADE,
  autoorg_run_id TEXT,
  seed INTEGER,
  model_map_json TEXT NOT NULL DEFAULT '{}',
  template_variant TEXT,
  constitution_variant TEXT,
  output_path TEXT,
  report_path TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed','cancelled')),
  started_at DATETIME NOT NULL DEFAULT (datetime('now')),
  finished_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_benchmark_attempts_run
  ON benchmark_attempts(benchmark_run_id, started_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: benchmark_metrics
-- Normalized metrics per attempt
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS benchmark_metrics (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES benchmark_attempts(id) ON DELETE CASCADE,
  score REAL NOT NULL DEFAULT 0,
  groundedness REAL NOT NULL DEFAULT 0,
  novelty REAL NOT NULL DEFAULT 0,
  consistency REAL NOT NULL DEFAULT 0,
  mission_alignment REAL NOT NULL DEFAULT 0,
  policy_compliance REAL NOT NULL DEFAULT 1,
  gold_match REAL NOT NULL DEFAULT 0,
  acceptance_pass INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  unsupported_claims INTEGER NOT NULL DEFAULT 0,
  broken_provenance_links INTEGER NOT NULL DEFAULT 0,
  security_findings INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_benchmark_metrics_attempt
  ON benchmark_metrics(attempt_id);

-- ────────────────────────────────────────────────────────────
-- TABLE: leaderboards
-- Aggregated benchmark views
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leaderboards (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL REFERENCES benchmark_suites(id) ON DELETE CASCADE,
  leaderboard_type TEXT NOT NULL CHECK(leaderboard_type IN ('model','template','constitution','overall')),
  subject_key TEXT NOT NULL,                     -- e.g. claude-opus-4 / hierarchy / const_v2
  average_score REAL NOT NULL DEFAULT 0,
  average_gold_match REAL NOT NULL DEFAULT 0,
  average_policy_compliance REAL NOT NULL DEFAULT 0,
  average_cost_usd REAL NOT NULL DEFAULT 0,
  average_latency_ms REAL NOT NULL DEFAULT 0,
  pass_rate REAL NOT NULL DEFAULT 0,
  samples INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leaderboards_suite_type
  ON leaderboards(suite_id, leaderboard_type, updated_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: constitution_experiments
-- A/B or tournament runs between constitutions
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS constitution_experiments (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL REFERENCES benchmark_suites(id) ON DELETE CASCADE,
  experiment_name TEXT NOT NULL,
  variant_a TEXT NOT NULL,
  variant_b TEXT NOT NULL,
  winner TEXT,
  delta_score REAL,
  delta_policy REAL,
  delta_cost REAL,
  artifact_path TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: regression_alarms
-- Detected benchmark regressions
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regression_alarms (
  id TEXT PRIMARY KEY,
  benchmark_run_id TEXT NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
  subject_key TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  baseline_value REAL NOT NULL,
  current_value REAL NOT NULL,
  delta_value REAL NOT NULL,
  threshold_value REAL NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('warn','error','critical')),
  explanation_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_regression_alarms_run
  ON regression_alarms(benchmark_run_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: replay_sessions
-- Offline replay of historical runs / attempts
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS replay_sessions (
  id TEXT PRIMARY KEY,
  source_run_id TEXT,
  source_attempt_id TEXT REFERENCES benchmark_attempts(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK(mode IN ('artifact_only','tool_trace','full_score_recompute')),
  status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
  artifact_path TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: judge_calibration_runs
-- Stability / consistency checks for RatchetJudge
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS judge_calibration_runs (
  id TEXT PRIMARY KEY,
  benchmark_run_id TEXT REFERENCES benchmark_runs(id) ON DELETE SET NULL,
  judge_model TEXT NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  mean_variance REAL NOT NULL DEFAULT 0,
  agreement_score REAL NOT NULL DEFAULT 0,
  artifact_path TEXT,
  report_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: template_bakeoffs
-- Compare org templates across same suite
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS template_bakeoffs (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL REFERENCES benchmark_suites(id) ON DELETE CASCADE,
  template_a TEXT NOT NULL,
  template_b TEXT NOT NULL,
  winner TEXT,
  delta_score REAL,
  delta_cost REAL,
  delta_latency REAL,
  artifact_path TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- Feature flags
-- ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES
  ('benchmarkLab', 1, 'Benchmark suite execution (Phase 7)'),
  ('goldEvaluator', 1, 'Gold output comparator with acceptance bands (Phase 7)'),
  ('leaderboards', 1, 'Cross-model / template / constitution leaderboards (Phase 7)'),
  ('constitutionAB', 1, 'Constitution A/B testing (Phase 7)'),
  ('regressionAlarms', 1, 'Regression detection and alerting (Phase 7)'),
  ('offlineReplayLab', 1, 'Offline replay of historical runs (Phase 7)'),
  ('judgeCalibration', 1, 'Judge consistency harness (Phase 7)'),
  ('templateBakeoffs', 1, 'Org template comparisons (Phase 7)'),
  ('benchmarkCI', 1, 'Benchmark mode in CI (Phase 7)');