SQL

-- ============================================================
-- AutoOrg Phase 9 Schema
-- Productization + platform
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLE: tenants
-- Top-level account/org boundary
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  plan_tier TEXT NOT NULL CHECK(plan_tier IN ('free','team','enterprise','internal')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','deleted')),
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: users
-- Platform users
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'local',
  auth_subject TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','invited','suspended','deleted')),
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  last_seen_at DATETIME
);

-- ────────────────────────────────────────────────────────────
-- TABLE: memberships
-- User membership in tenant
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL CHECK(role_key IN ('owner','admin','editor','reviewer','viewer','billing')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','invited','revoked')),
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant
  ON memberships(tenant_id, role_key);

-- ────────────────────────────────────────────────────────────
-- TABLE: sessions
-- Browser/API sessions
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  session_token_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  last_seen_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_sessions_user
  ON sessions(user_id, expires_at);

-- ────────────────────────────────────────────────────────────
-- TABLE: api_keys
-- Personal or service API keys
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  key_name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  last_used_at DATETIME,
  expires_at DATETIME,
  revoked_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant
  ON api_keys(tenant_id, key_prefix);

-- ────────────────────────────────────────────────────────────
-- TABLE: workspaces
-- Tenant-contained workspace root
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  repo_url TEXT,
  default_branch TEXT,
  isolation_mode TEXT NOT NULL CHECK(isolation_mode IN ('directory','git_worktree','container')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived','deleted')),
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_workspaces_tenant
  ON workspaces(tenant_id, status);

-- ────────────────────────────────────────────────────────────
-- TABLE: workspace_memberships
-- User roles at workspace scope
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_memberships (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL CHECK(role_key IN ('admin','editor','reviewer','viewer','runner')),
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, user_id)
);

-- ────────────────────────────────────────────────────────────
-- TABLE: permission_overrides
-- Fine-grained overrides
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permission_overrides (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('user','api_key','membership_role')),
  subject_ref TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  effect TEXT NOT NULL CHECK(effect IN ('allow','deny')),
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_permission_overrides_scope
  ON permission_overrides(tenant_id, workspace_id, subject_type);

-- ────────────────────────────────────────────────────────────
-- TABLE: hosted_runs
-- Platform-submitted runs
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hosted_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  submitted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK(mode IN ('single_org','portfolio','benchmark','daemon')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','cancelled')),
  request_json TEXT NOT NULL,
  autoorg_run_ref TEXT,
  portfolio_run_ref TEXT,
  assigned_agent_id TEXT,
  output_artifact_path TEXT,
  report_artifact_path TEXT,
  started_at DATETIME,
  finished_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hosted_runs_workspace
  ON hosted_runs(workspace_id, status, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: remote_agents
-- Remote workers for hosted runs
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS remote_agents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  agent_name TEXT NOT NULL,
  deployment_mode TEXT NOT NULL CHECK(deployment_mode IN ('local','single-node','cloud-worker','managed')),
  capability_json TEXT NOT NULL DEFAULT '{}',
  heartbeat_at DATETIME,
  lease_expires_at DATETIME,
  status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','busy','offline','disabled')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_remote_agents_status
  ON remote_agents(status, heartbeat_at);

-- ────────────────────────────────────────────────────────────
-- TABLE: quota_policies
-- Tenant/workspace quotas
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quota_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  quota_key TEXT NOT NULL CHECK(quota_key IN (
    'runs_per_day','tokens_per_month','usd_per_month','storage_gb','agents','benchmarks_per_day'
  )),
  limit_value REAL NOT NULL,
  hard_limit INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quota_policies_scope
  ON quota_policies(tenant_id, workspace_id, quota_key);

-- ────────────────────────────────────────────────────────────
-- TABLE: quota_usage
-- Quota consumption ledger
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quota_usage (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  quota_key TEXT NOT NULL,
  window_start DATETIME NOT NULL,
  window_end DATETIME NOT NULL,
  used_value REAL NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quota_usage_scope
  ON quota_usage(tenant_id, workspace_id, quota_key, window_start);

-- ────────────────────────────────────────────────────────────
-- TABLE: billing_events
-- Metered cost events
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  hosted_run_id TEXT REFERENCES hosted_runs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('run','llm_tokens','tool_calls','storage','backup','agent_minutes','benchmark')),
  quantity REAL NOT NULL DEFAULT 0,
  unit_cost_usd REAL NOT NULL DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_billing_events_tenant
  ON billing_events(tenant_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: comments
-- Collaboration threads on runs/artifacts
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  parent_comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL CHECK(subject_kind IN ('hosted_run','approval','artifact','portfolio_run','benchmark_run')),
  subject_ref TEXT NOT NULL,
  body TEXT NOT NULL,
  mentions_json TEXT NOT NULL DEFAULT '[]',
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_subject
  ON comments(subject_kind, subject_ref, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: org_templates
-- Shareable org templates
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  template_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK(visibility IN ('private','tenant','public')),
  category TEXT NOT NULL,
  manifest_json TEXT NOT NULL DEFAULT '{}',
  version TEXT NOT NULL DEFAULT '1.0.0',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived','draft')),
  published_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_org_templates_visibility
  ON org_templates(visibility, category, updated_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: role_registry
-- Reusable role packs
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_registry (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  role_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role_manifest_json TEXT NOT NULL DEFAULT '{}',
  visibility TEXT NOT NULL CHECK(visibility IN ('private','tenant','public')),
  version TEXT NOT NULL DEFAULT '1.0.0',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_role_registry_visibility
  ON role_registry(visibility, role_key);

-- ────────────────────────────────────────────────────────────
-- TABLE: backup_jobs
-- Backup / restore / export jobs
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backup_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK(job_type IN ('backup','restore','export')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','cancelled')),
  source_path TEXT,
  artifact_path TEXT,
  sha256 TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  finished_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_scope
  ON backup_jobs(tenant_id, workspace_id, status);

-- ────────────────────────────────────────────────────────────
-- TABLE: retention_policies
-- Retention / purge policies by artifact class
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retention_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  artifact_class TEXT NOT NULL,
  retain_days INTEGER NOT NULL,
  purge_mode TEXT NOT NULL CHECK(purge_mode IN ('delete','archive')),
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: compliance_logs
-- Compliance/audit events
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('user','api_key','system','agent')),
  actor_ref TEXT,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'auth_login','auth_failure','api_key_created','run_submitted','run_cancelled',
    'approval_action','permission_denied','backup_exported','restore_started',
    'retention_purge','template_published','workspace_created'
  )),
  subject_kind TEXT,
  subject_ref TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_tenant
  ON compliance_logs(tenant_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: observability_snapshots
-- Periodic admin metrics snapshots
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS observability_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  workspace_id TEXT,
  snapshot_type TEXT NOT NULL CHECK(snapshot_type IN ('platform','tenant','workspace','agent')),
  metrics_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_observability_snapshots_type
  ON observability_snapshots(snapshot_type, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: sdk_clients
-- Public API consumers / apps
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sdk_clients (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_type TEXT NOT NULL CHECK(client_type IN ('server','browser','cli','internal')),
  scopes_json TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- Feature flags
-- ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES
  ('multiTenantAuth', 1, 'Tenant/user/session/auth support (Phase 9)'),
  ('rbacPlatform', 1, 'RBAC and permission checks (Phase 9)'),
  ('hostedRuns', 1, 'Hosted run dispatch and management (Phase 9)'),
  ('remoteAgents', 1, 'Remote workers/agents (Phase 9)'),
  ('templateMarketplace', 1, 'Org template/role registry (Phase 9)'),
  ('billingAndQuotas', 1, 'Quota enforcement and billing events (Phase 9)'),
  ('workspaceIsolation', 1, 'Workspace isolation and provisioning (Phase 9)'),
  ('backupRestore', 1, 'Backup/restore/export jobs (Phase 9)'),
  ('complianceRetention', 1, 'Compliance logs and retention policies (Phase 9)'),
  ('adminObservability', 1, 'Admin observability dashboard (Phase 9)'),
  ('publicApiSdk', 1, 'Public API/SDK (Phase 9)');