SQL

-- ============================================================
-- AutoOrg Phase 6.1 Schema
-- Safety + provenance hardening
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLE: action_policies
-- Governs READ / PROPOSE / PATCH / EXECUTE / PUBLISH
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS action_policies (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  team_id TEXT,
  role TEXT NOT NULL,
  action_class TEXT NOT NULL CHECK(action_class IN ('READ','PROPOSE','PATCH','EXECUTE','PUBLISH')),
  target_selector TEXT NOT NULL DEFAULT '*',      -- tool name, path glob, publish target, etc.
  risk_tier TEXT NOT NULL CHECK(risk_tier IN ('low','medium','high','critical')),
  allowed INTEGER NOT NULL DEFAULT 1,
  require_approval INTEGER NOT NULL DEFAULT 0,
  require_reversible INTEGER NOT NULL DEFAULT 0,
  require_provenance INTEGER NOT NULL DEFAULT 1,
  require_signature INTEGER NOT NULL DEFAULT 1,
  conditions_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_action_policies_run_role
  ON action_policies(run_id, role, team_id, action_class);

-- ────────────────────────────────────────────────────────────
-- TABLE: action_ledger
-- Append-only action log with reversibility metadata
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS action_ledger (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  cycle_number INTEGER NOT NULL,
  parent_action_id TEXT REFERENCES action_ledger(id) ON DELETE SET NULL,
  approval_id TEXT,
  role TEXT NOT NULL,
  team_id TEXT,
  action_class TEXT NOT NULL CHECK(action_class IN ('READ','PROPOSE','PATCH','EXECUTE','PUBLISH')),
  target_kind TEXT NOT NULL,                         -- tool/file/git/api/output
  target_ref TEXT NOT NULL,
  risk_tier TEXT NOT NULL CHECK(risk_tier IN ('low','medium','high','critical')),
  status TEXT NOT NULL CHECK(status IN (
    'proposed','pending_approval','approved','applied','reverted','denied','failed','cancelled'
  )),
  summary TEXT NOT NULL,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT,
  artifact_path TEXT,
  input_hash TEXT,
  output_hash TEXT,
  reversible INTEGER NOT NULL DEFAULT 0,
  compensation_action_json TEXT,
  policy_snapshot_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  applied_at DATETIME,
  reverted_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_action_ledger_run_cycle
  ON action_ledger(run_id, cycle_number, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: run_manifests
-- Signed run manifests at boot
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS run_manifests (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  artifact_path TEXT NOT NULL,
  git_head TEXT,
  manifest_sha256 TEXT NOT NULL,
  signature TEXT NOT NULL,
  signer TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_run_manifests_run
  ON run_manifests(run_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: artifact_manifests
-- Immutable artifact metadata + signatures
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS artifact_manifests (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  action_id TEXT REFERENCES action_ledger(id) ON DELETE SET NULL,
  artifact_path TEXT NOT NULL,
  artifact_kind TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  parent_sha256 TEXT,
  signature TEXT NOT NULL,
  signer TEXT NOT NULL,
  immutable INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_artifact_manifests_run
  ON artifact_manifests(run_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: claim_registry
-- Claims extracted from outputs
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_registry (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  cycle_number INTEGER NOT NULL,
  role TEXT NOT NULL,
  task_id TEXT,
  evidence_pack_id TEXT REFERENCES evidence_packs(id) ON DELETE SET NULL,
  claim_text TEXT NOT NULL,
  claim_hash TEXT NOT NULL,
  support_level TEXT NOT NULL CHECK(support_level IN ('supported','partial','unsupported','inferred')),
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_claim_registry_run_cycle
  ON claim_registry(run_id, cycle_number);

-- ────────────────────────────────────────────────────────────
-- TABLE: claim_citations
-- Links claims to evidence items and provenance refs
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_citations (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claim_registry(id) ON DELETE CASCADE,
  evidence_item_id TEXT REFERENCES evidence_items(id) ON DELETE SET NULL,
  tool_execution_id TEXT REFERENCES tool_executions(id) ON DELETE SET NULL,
  citation_label TEXT,
  graph_node_ref TEXT,
  source_chunk_ref TEXT,
  seed_material_ref TEXT,
  confidence REAL NOT NULL DEFAULT 0.5,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_claim_citations_claim
  ON claim_citations(claim_id);

-- ────────────────────────────────────────────────────────────
-- TABLE: provenance_reports
-- Coverage / broken-link reporting for claim chains
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provenance_reports (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  cycle_number INTEGER NOT NULL,
  role TEXT NOT NULL,
  evidence_pack_id TEXT REFERENCES evidence_packs(id) ON DELETE SET NULL,
  total_claims INTEGER NOT NULL DEFAULT 0,
  linked_claims INTEGER NOT NULL DEFAULT 0,
  broken_links INTEGER NOT NULL DEFAULT 0,
  report_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_provenance_reports_run_cycle
  ON provenance_reports(run_id, cycle_number);

-- ────────────────────────────────────────────────────────────
-- TABLE: redaction_events
-- Secret / PII / unsafe text redactions
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS redaction_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  cycle_number INTEGER,
  channel TEXT NOT NULL CHECK(channel IN ('transcript','memory','artifact','log','output')),
  artifact_path TEXT,
  detector TEXT NOT NULL CHECK(detector IN ('secret','pii','private_key','token','prompt_leak')),
  finding_type TEXT NOT NULL,
  replacement TEXT NOT NULL,
  before_hash TEXT NOT NULL,
  after_hash TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_redaction_events_run
  ON redaction_events(run_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: security_findings
-- Violations / risky actions / provenance gaps / leaks
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_findings (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  cycle_number INTEGER,
  severity TEXT NOT NULL CHECK(severity IN ('info','warn','error','critical')),
  category TEXT NOT NULL CHECK(category IN (
    'policy_violation',
    'secret_exposure',
    'pii_exposure',
    'sandbox_escape_attempt',
    'unsafe_execute',
    'unsafe_publish',
    'provenance_gap',
    'approval_gap',
    'artifact_tamper'
  )),
  action_id TEXT REFERENCES action_ledger(id) ON DELETE SET NULL,
  tool_execution_id TEXT REFERENCES tool_executions(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','waived')),
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_security_findings_run
  ON security_findings(run_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TABLE: policy_reports
-- Policy compliance scoring per role/cycle
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_reports (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  cycle_number INTEGER NOT NULL,
  role TEXT NOT NULL,
  task_id TEXT,
  score REAL NOT NULL,
  approval_gaps INTEGER NOT NULL DEFAULT 0,
  unsafe_action_count INTEGER NOT NULL DEFAULT 0,
  violations_json TEXT NOT NULL DEFAULT '[]',
  report_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_policy_reports_run_cycle
  ON policy_reports(run_id, cycle_number);

-- ────────────────────────────────────────────────────────────
-- TABLE: security_exports
-- Exported audit bundles
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_exports (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  export_format TEXT NOT NULL CHECK(export_format IN ('json','markdown')),
  artifact_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_security_exports_run
  ON security_exports(run_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- Feature flags
-- ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES
  ('policyEngine', 1, 'Action policy engine for READ/PROPOSE/PATCH/EXECUTE/PUBLISH (Phase 6.1)'),
  ('actionLedger', 1, 'Append-only reversible action ledger (Phase 6.1)'),
  ('provenanceChain', 1, 'Claim-to-citation provenance tracking (Phase 6.1)'),
  ('artifactSigning', 1, 'Signed manifests + immutable artifact metadata (Phase 6.1)'),
  ('redactionFilters', 1, 'Secret + PII redaction before persistence (Phase 6.1)'),
  ('riskTieredApprovals', 1, 'Escalate risky actions to stronger approvals (Phase 6.1)'),
  ('unsafeActionDetector', 1, 'LLM + heuristic safety review for dangerous actions (Phase 6.1)'),
  ('policyAwareJudge', 1, 'Judge receives policy compliance score (Phase 6.1)'),
  ('securityAuditExport', 1, 'Export run audit bundles (Phase 6.1)'),
  ('immutableArtifacts', 1, 'Artifact manifests are signed and append-only (Phase 6.1)');