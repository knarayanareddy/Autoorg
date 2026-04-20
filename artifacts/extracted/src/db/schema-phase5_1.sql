SQL

-- ============================================================
-- AutoOrg Phase 5.1 Hardening
-- Strict approval blocking + recovery + leases + budgets
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLE: pending_actions
-- Actions that cannot materialize until approval is granted
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY,
  approval_id TEXT NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  cycle_number INTEGER,
  action_type TEXT NOT NULL CHECK(action_type IN ('commit','push','merge','ultraplan_apply','job')),
  status TEXT NOT NULL DEFAULT 'staged'
    CHECK(status IN ('staged','approved','materialized','rejected','expired','failed')),
  branch_name TEXT,
  target_ref TEXT,
  artifact_path TEXT NOT NULL,       -- full artifact / snapshot
  diff_path TEXT,                    -- optional git patch
  commit_message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  error_text TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  materialized_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_pending_actions_run_status
  ON pending_actions(run_id, status);

-- ────────────────────────────────────────────────────────────
-- TABLE: run_checkpoints
-- Durable resume points for orchestrator + daemon
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS run_checkpoints (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  cycle_number INTEGER NOT NULL,
  stage TEXT NOT NULL CHECK(stage IN (
    'boot',
    'pre_cycle',
    'post_team_assignment',
    'post_workers',
    'post_score',
    'post_decision',
    'post_dream',
    'idle'
  )),
  state_json TEXT NOT NULL,
  git_head TEXT,
  best_score REAL,
  plateau_count INTEGER DEFAULT 0,
  consecutive_rejects INTEGER DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_run_checkpoints_run_stage
  ON run_checkpoints(run_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: recovery_events
-- Recovery diagnostics after restart/crash
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recovery_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'crash_detected',
    'resume_started',
    'resume_succeeded',
    'resume_failed',
    'orphan_reclaimed',
    'lock_stolen_after_expiry'
  )),
  summary TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recovery_events_run
  ON recovery_events(run_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: workspace_locks
-- Prevents two daemons/runs mutating same repo/workspace
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_locks (
  lock_key TEXT PRIMARY KEY,         -- e.g. repo:/abs/path/to/repo
  holder_id TEXT NOT NULL,           -- daemon or run instance
  run_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','released','expired')),
  lease_expires_at DATETIME NOT NULL,
  heartbeat_at DATETIME NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: worker_leases
-- Worker claim + heartbeat + reclaim
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_leases (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  cycle_number INTEGER NOT NULL,
  task_id TEXT NOT NULL,
  worker_role TEXT NOT NULL,
  worker_instance TEXT NOT NULL,
  team_id TEXT,
  status TEXT NOT NULL DEFAULT 'leased'
    CHECK(status IN ('leased','running','completed','expired','reclaimed','failed','cancelled')),
  lease_expires_at DATETIME NOT NULL,
  heartbeat_at DATETIME NOT NULL DEFAULT (datetime('now')),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  error_text TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_worker_leases_run_status
  ON worker_leases(run_id, status, lease_expires_at);

-- ────────────────────────────────────────────────────────────
-- TABLE: job_executions
-- Actual executions for scheduled jobs
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_executions (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
  run_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','running','completed','failed','cancelled','expired')),
  claimed_by TEXT,
  lease_expires_at DATETIME,
  started_at DATETIME,
  finished_at DATETIME,
  output_json TEXT,
  error_text TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_job_executions_job
  ON job_executions(job_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: issue_tasks
-- GitHub issues translated into org-native tasks
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS issue_tasks (
  id TEXT PRIMARY KEY,
  github_event_id TEXT REFERENCES github_events(id),
  repo_full_name TEXT NOT NULL,
  issue_number INTEGER NOT NULL,
  run_id TEXT,
  team_id TEXT,
  title TEXT NOT NULL,
  translated_mission TEXT NOT NULL,
  acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
  risk_level TEXT NOT NULL CHECK(risk_level IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'translated'
    CHECK(status IN ('translated','queued','in_progress','done','rejected')),
  source_payload_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_issue_tasks_repo_issue
  ON issue_tasks(repo_full_name, issue_number);

-- ────────────────────────────────────────────────────────────
-- TABLE: team_budgets
-- Per-team resource ceilings
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_budgets (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  budget_type TEXT NOT NULL CHECK(budget_type IN ('usd','tokens','tool_calls','minutes')),
  window_scope TEXT NOT NULL CHECK(window_scope IN ('run','cycle')),
  limit_value REAL NOT NULL,
  consumed_value REAL NOT NULL DEFAULT 0,
  hard_limit INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_team_budgets_run_team
  ON team_budgets(run_id, team_id);

-- ────────────────────────────────────────────────────────────
-- TABLE: budget_events
-- Budget accounting ledger
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  role TEXT,
  cycle_number INTEGER,
  budget_type TEXT NOT NULL CHECK(budget_type IN ('usd','tokens','tool_calls','minutes')),
  delta_value REAL NOT NULL,
  reason TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_events_run_team
  ON budget_events(run_id, team_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: memory_partitions
-- Team-scoped memory lanes
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_partitions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  partition_name TEXT NOT NULL,
  index_path TEXT NOT NULL,
  facts_dir TEXT NOT NULL,
  read_scope_json TEXT NOT NULL DEFAULT '["shared"]',
  write_scope_json TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_memory_partitions_run_team
  ON memory_partitions(run_id, team_id);

-- ────────────────────────────────────────────────────────────
-- TABLE: ultraplan_checkpoints
-- Periodic saved state for long ULTRAPLAN sessions
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ultraplan_checkpoints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES ultraplan_sessions(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  cycle_number INTEGER NOT NULL,
  checkpoint_number INTEGER NOT NULL,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ultraplan_checkpoints_session
  ON ultraplan_checkpoints(session_id, checkpoint_number);

-- ────────────────────────────────────────────────────────────
-- TABLE: ultraplan_sla_events
-- Timeout / cancel / checkpoint / overbudget diagnostics
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ultraplan_sla_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES ultraplan_sessions(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'started',
    'checkpoint',
    'timeout',
    'cancelled',
    'completed',
    'over_budget'
  )),
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ultraplan_sla_session
  ON ultraplan_sla_events(session_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: incident_log
-- General hardening / ops incidents
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incident_log (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  severity TEXT NOT NULL CHECK(severity IN ('info','warn','error','critical')),
  component TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_incident_log_created
  ON incident_log(created_at DESC);

-- ────────────────────────────────────────────────────────────
-- Feature flags
-- ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES
  ('strictApprovalBlocking', 1, 'No commit/push/merge without approved gate (Phase 5.1)'),
  ('daemonRecovery', 1, 'Resume interrupted runs after restart (Phase 5.1)'),
  ('workerLeases', 1, 'Heartbeat-based worker leases (Phase 5.1)'),
  ('workspaceLocks', 1, 'Repo/workspace concurrency locks (Phase 5.1)'),
  ('jobExecutions', 1, 'Track and lease actual job executions (Phase 5.1)'),
  ('issueTranslation', 1, 'GitHub issue -> org task translation (Phase 5.1)'),
  ('diffPatchSummary', 1, 'PR summaries from actual git diff (Phase 5.1)'),
  ('teamBudgets', 1, 'Per-team budgets and usage ledger (Phase 5.1)'),
  ('teamMemoryPartitions', 1, 'Subteam-specific memory partitions (Phase 5.1)'),
  ('ultraplanSla', 1, 'ULTRAPLAN timeout/checkpoint/cancel policy (Phase 5.1)'),
  ('incidentLog', 1, 'Operational incident logging (Phase 5.1)');