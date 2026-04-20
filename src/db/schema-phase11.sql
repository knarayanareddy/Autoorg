-- ============================================================
-- AutoOrg Phase 11 Schema
-- Enterprise CI/CD & Remote Orchestration
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLE: tenants
-- Multi-tenant separation
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','deleted')),
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: workspaces
-- Mission sandboxes per tenant
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  isolation_mode TEXT NOT NULL DEFAULT 'git' CHECK(isolation_mode IN ('git','docker')),
  root_path TEXT NOT NULL,
  repo_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, slug)
);

-- ────────────────────────────────────────────────────────────
-- TABLE: remote_agents
-- Self-registering worker nodes (Local or Cloud)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS remote_agents (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  agent_location TEXT NOT NULL DEFAULT 'local' CHECK(agent_location IN ('local','cloud')),
  status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','busy','offline')),
  heartbeat_at DATETIME NOT NULL DEFAULT (datetime('now')),
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: hosted_runs
-- Queue for remote execution
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hosted_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  assigned_agent_id TEXT REFERENCES remote_agents(id),
  mode TEXT NOT NULL CHECK(mode IN ('single_org','portfolio','benchmark','daemon')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','cancelled')),
  request_json TEXT NOT NULL,
  output_artifact_path TEXT,
  started_at DATETIME,
  finished_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: api_keys
-- Scoped credentials for SDK and CI/CD
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  key_hash TEXT NOT NULL UNIQUE,
  key_name TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '["run.read","run.create"]',
  last_used_at DATETIME,
  expires_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- Feature flags for Phase 11
-- ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES
  ('dockerIsolation', 1, 'Enable containerized sandboxing (Phase 11)'),
  ('remoteAgents', 1, 'Enable multi-node worker scaling (Phase 11)'),
  ('githubWebhooks', 1, 'Enable CI/CD trigger integration (Phase 11)'),
  ('cloudTunneling', 1, 'Enable encrypted cloud agent heartbeats (Phase 11)');
