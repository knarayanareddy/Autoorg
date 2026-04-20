-- ============================================================
-- AutoOrg Phase 10 Schema
-- Swarm Intelligence & Inter-Org Economics
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLE: org_wallets
-- Tracks virtual credits and P&L at organization level
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_wallets (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  balance_credits REAL NOT NULL DEFAULT 0.0,
  total_earned REAL NOT NULL DEFAULT 0.0,
  total_spent REAL NOT NULL DEFAULT 0.0,
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: inter_org_contracts
-- Service Level Agreements between Orgs
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inter_org_contracts (
  id TEXT PRIMARY KEY,
  master_run_id TEXT NOT NULL REFERENCES runs(id),
  contractor_run_id TEXT NOT NULL REFERENCES runs(id),
  service_key TEXT NOT NULL,
  budget_credits REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','failed','disputed')),
  task_payload_json TEXT NOT NULL,
  result_artifact_ref TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  closed_at DATETIME
);

-- ────────────────────────────────────────────────────────────
-- TABLE: swarm_bus_messages
-- Cross-org communication (routing)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS swarm_bus_messages (
  id TEXT PRIMARY KEY,
  sender_run_id TEXT NOT NULL,
  receiver_run_id TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK(message_type IN ('request','response','event','heartbeat')),
  payload_json TEXT NOT NULL,
  is_delivered INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: service_registry
-- Capabilities advertised by organizations
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_registry (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  service_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  capability_md TEXT NOT NULL,
  unit_price_credits REAL NOT NULL DEFAULT 1.0,
  up_since_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TABLE: swarm_ledgers
-- Detailed financial audit trail
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS swarm_ledgers (
  id TEXT PRIMARY KEY,
  from_wallet_id TEXT REFERENCES org_wallets(id),
  to_wallet_id TEXT REFERENCES org_wallets(id),
  amount REAL NOT NULL,
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('contract_escrow','settlement','refund','tax','dividend')),
  memo TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- Feature flags
-- ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES
  ('interOrgEconomics', 1, 'Virtual credit ledger between Orgs (Phase 10)'),
  ('swarmBus', 1, 'Cross-org messaging infrastructure (Phase 10)'),
  ('serviceRegistry', 1, 'Org capability discovery (Phase 10)'),
  ('hierarchicalSwarm', 1, 'Master-sub orchestration (Phase 10)');
