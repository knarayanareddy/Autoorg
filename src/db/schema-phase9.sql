-- ============================================================
-- AutoOrg Phase 9 Schema
-- Strategic pivoting & multi-objective optimization
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLE: strategic_pivots
-- Mid-run organizational strategy shifts
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS strategic_pivots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  cycle_number INTEGER NOT NULL,
  pivot_type TEXT NOT NULL CHECK(pivot_type IN ('minor','major')),
  reasoning_json TEXT NOT NULL,
  proposed_plan_md TEXT NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(approval_status IN ('pending','approved','rejected','auto_approved')),
  applied_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: multi_objectives
-- Pareto weightings for cost, quality, and speed
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS multi_objectives (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  quality_weight REAL NOT NULL DEFAULT 1.0,
  cost_weight REAL NOT NULL DEFAULT 1.0,
  speed_weight REAL NOT NULL DEFAULT 1.0,
  max_cost_usd REAL,
  max_cycles INTEGER,
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: dynamic_roles
-- On-the-fly agent role injections
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dynamic_roles (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,
  assignment_reason TEXT NOT NULL,
  specialization_json TEXT NOT NULL DEFAULT '{}',
  assigned_at_cycle INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: mission_snapshots
-- Full state serialization for pause/resume
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mission_snapshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  cycle_number INTEGER NOT NULL,
  snapshot_path TEXT NOT NULL,
  db_checksum TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: reflection_reports
-- "Process Debt" and organizational critique
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reflection_reports (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  cycle_number INTEGER NOT NULL,
  critique_md TEXT NOT NULL,
  debt_score REAL NOT NULL, -- 0-1 (1 is high process debt)
  bottlenecks_json TEXT NOT NULL DEFAULT '[]',
  suggested_pivots_json TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- Feature flags
-- ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES
  ('strategicPivoting', 1, 'Mid-run strategy adaptation (Phase 9)'),
  ('objectiveOptimization', 1, 'Cost/Quality slider tuning (Phase 9)'),
  ('cycleSnapshots', 1, 'Automated per-cycle state persistence (Phase 9)'),
  ('processReflection', 1, 'Computational organizational critique (Phase 9)'),
  ('dynamicRoles', 1, 'On-the-fly agent hiring/swapping (Phase 9)');
