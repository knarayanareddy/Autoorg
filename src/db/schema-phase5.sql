-- ============================================================
-- AutoOrg Phase 5 Schema
-- Hierarchical coordination + daemon + approvals + jobs + GitHub
-- ============================================================

-- Department/subteam metadata
CREATE TABLE IF NOT EXISTS teams (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  name            TEXT NOT NULL,            -- "Research", "Quality", "Planning"
  lead_role       TEXT NOT NULL,            -- "CoordinatorLead"
  mission         TEXT NOT NULL,
  active          INTEGER NOT NULL DEFAULT 1,
  created_cycle   INTEGER NOT NULL,
  parent_team_id  TEXT REFERENCES teams(id),
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_teams_run ON teams(run_id);

-- Which roles belong to which team
CREATE TABLE IF NOT EXISTS team_members (
  id          TEXT PRIMARY KEY,
  team_id      TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);

-- Tasks handed from CEO → Department Lead → Workers
CREATE TABLE IF NOT EXISTS delegated_tasks (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  cycle_number    INTEGER NOT NULL,
  from_role       TEXT NOT NULL,
  to_role         TEXT NOT NULL,
  team_id         TEXT REFERENCES teams(id),
  task_type       TEXT NOT NULL,            -- 'research'|'quality'|'planning'|'memory'
  instruction     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','running','completed','failed','cancelled')),
  result_summary  TEXT,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_delegated_tasks_run_cycle
  ON delegated_tasks(run_id, cycle_number);

-- Long-running deep planning sessions
CREATE TABLE IF NOT EXISTS ultraplan_sessions (
  id                TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL,
  cycle_number      INTEGER NOT NULL,
  trigger_reason    TEXT NOT NULL,          -- 'plateau'|'manual'|'ceo_request'
  status            TEXT NOT NULL DEFAULT 'running'
                      CHECK(status IN ('running','completed','failed','cancelled','approved','rejected')),
  planner_model     TEXT NOT NULL,
  prompt            TEXT NOT NULL,
  result_text       TEXT,
  approval_required INTEGER NOT NULL DEFAULT 1,
  approved          INTEGER DEFAULT 0,
  rejected          INTEGER DEFAULT 0,
  cost_usd          REAL DEFAULT 0,
  duration_ms       INTEGER,
  created_at        DATETIME NOT NULL DEFAULT (datetime('now')),
  completed_at      DATETIME
);

CREATE INDEX IF NOT EXISTS idx_ultraplan_run ON ultraplan_sessions(run_id, cycle_number DESC);

-- Human approval gates
CREATE TABLE IF NOT EXISTS approvals (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  cycle_number    INTEGER,
  approval_type   TEXT NOT NULL
                    CHECK(approval_type IN ('commit','push','merge','ultraplan','daemon_action','job')),
  subject         TEXT NOT NULL,          -- commit hash / session ID / job ID
  requested_by    TEXT NOT NULL,          -- CEO / system / daemon
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','approved','rejected','expired')),
  summary         TEXT NOT NULL,
  details_json    TEXT NOT NULL DEFAULT '{}',
  requested_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  decided_at      DATETIME,
  decided_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_approvals_run_status
  ON approvals(run_id, status);

-- Cron-like jobs for daemon mode
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id              TEXT PRIMARY KEY,
  run_id          TEXT,
  job_type        TEXT NOT NULL
                    CHECK(job_type IN ('org_run','dream','graph_rebuild','health_check','github_sync')),
  cron_expr       TEXT NOT NULL,           -- basic cron string or interval token
  payload_json    TEXT NOT NULL DEFAULT '{}',
  enabled         INTEGER NOT NULL DEFAULT 1,
  last_run_at     DATETIME,
  next_run_at     DATETIME,
  status          TEXT NOT NULL DEFAULT 'idle'
                    CHECK(status IN ('idle','running','paused','error')),
  last_error      TEXT,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_next_run ON scheduled_jobs(enabled, next_run_at);

-- Persistent daemon status
CREATE TABLE IF NOT EXISTS daemon_state (
  id                TEXT PRIMARY KEY,
  instance_name     TEXT NOT NULL DEFAULT 'default',
  status            TEXT NOT NULL DEFAULT 'stopped'
                      CHECK(status IN ('starting','running','stopped','error','paused')),
  pid               INTEGER,
  last_heartbeat    DATETIME,
  current_run_id    TEXT,
  metadata_json     TEXT NOT NULL DEFAULT '{}',
  updated_at        DATETIME NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO daemon_state (id, instance_name, status, metadata_json)
VALUES ('daemon_default', 'default', 'stopped', '{}');

-- Webhook/event ingestion
CREATE TABLE IF NOT EXISTS github_events (
  id              TEXT PRIMARY KEY,
  event_type      TEXT NOT NULL,
  repo_full_name  TEXT,
  delivery_id     TEXT,
  action          TEXT,
  payload_json    TEXT NOT NULL,
  processed       INTEGER NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_github_events_processed
  ON github_events(processed, created_at);

-- Repo-level sync metadata
CREATE TABLE IF NOT EXISTS github_sync_state (
  id              TEXT PRIMARY KEY,
  repo_full_name  TEXT NOT NULL UNIQUE,
  installation_id TEXT,
  last_issue_sync DATETIME,
  last_pr_sync    DATETIME,
  settings_json   TEXT NOT NULL DEFAULT '{}',
  updated_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- Generated PR drafts/comments
CREATE TABLE IF NOT EXISTS pr_drafts (
  id              TEXT PRIMARY KEY,
  run_id          TEXT,
  cycle_number    INTEGER,
  repo_full_name  TEXT,
  branch_name     TEXT,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK(status IN ('draft','submitted','merged','closed')),
  github_pr_number INTEGER,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- Feature flags for Phase 5
INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES
  ('coordinatorHierarchy', 1, 'CEO -> Team leads -> workers hierarchy (Phase 5)'),
  ('subteams',            1, 'Department/subteam execution (Phase 5)'),
  ('ultraplan',           1, 'Long-running deep planning mode (Phase 5)'),
  ('daemonMode',          1, 'Persistent background daemon (Phase 5)'),
  ('scheduler',           1, 'Cron / scheduled jobs (Phase 5)'),
  ('approvalGates',       1, 'Human approval checkpoints (Phase 5)'),
  ('githubIntegration',   0, 'GitHub API/webhook integration (Phase 5)'),
  ('prDrafts',            0, 'Auto-generate PR drafts/comments (Phase 5)'),
  ('daemonAutoDream',     1, 'Daemon-triggered dreams/health maintenance (Phase 5)');
