-- ============================================================
-- Migration 002 — Schema reconciliation
--
-- Adds the tables and columns that the TypeScript runtime already
-- referenced but which were missing from 001_baseline.sql. On a fresh
-- database 001 already creates the reconciled shape, so every statement
-- here is guarded and becomes a no-op.
--
-- On an EXISTING database this is what actually upgrades it. SQLite has no
-- `ADD COLUMN IF NOT EXISTS`, so column additions live in `migrate.ts`
-- (`ensureColumn`), which checks PRAGMA table_info first.
--
-- Kept idempotent on purpose: re-running must be safe.
-- ============================================================

-- ── Objections (Critic memory; orchestrator reads this on cycle 1) ──
CREATE TABLE IF NOT EXISTS objections (
  id               TEXT PRIMARY KEY,
  run_id           TEXT NOT NULL,
  cycle_raised     INTEGER NOT NULL,
  cycle_resolved   INTEGER,
  severity         TEXT NOT NULL CHECK(severity IN ('BLOCKER','MAJOR','MINOR')),
  description      TEXT NOT NULL,
  proposed_fix     TEXT NOT NULL DEFAULT '',
  evidence         TEXT NOT NULL DEFAULT '',
  resolved         INTEGER NOT NULL DEFAULT 0,
  resolution_note  TEXT,
  created_at       DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at       DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_objections_run_open ON objections(run_id, resolved);
CREATE INDEX IF NOT EXISTS idx_objections_severity ON objections(run_id, severity, resolved);

-- ── Governance / hardening ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS action_ledger (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, cycle_number INTEGER, team_id TEXT,
  role TEXT NOT NULL,
  action_class TEXT NOT NULL CHECK(action_class IN ('READ','PROPOSE','PATCH','EXECUTE','PUBLISH')),
  target_kind TEXT NOT NULL CHECK(target_kind IN ('tool','file','git','api','output')),
  target_ref TEXT NOT NULL,
  risk_tier TEXT NOT NULL CHECK(risk_tier IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK(status IN ('proposed','approved','pending_approval','applied','failed','compensated')),
  summary TEXT NOT NULL,
  input_json TEXT NOT NULL DEFAULT '{}', input_hash TEXT,
  output_json TEXT, output_hash TEXT,
  reversible INTEGER NOT NULL DEFAULT 0, compensation_action_json TEXT,
  approval_id TEXT, policy_snapshot_json TEXT NOT NULL DEFAULT '{}',
  artifact_path TEXT, applied_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_action_ledger_run ON action_ledger(run_id);
CREATE INDEX IF NOT EXISTS idx_action_ledger_cycle ON action_ledger(run_id, cycle_number);
CREATE INDEX IF NOT EXISTS idx_action_ledger_status ON action_ledger(status);

CREATE TABLE IF NOT EXISTS action_policies (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, team_id TEXT, role TEXT NOT NULL,
  action_class TEXT NOT NULL CHECK(action_class IN ('READ','PROPOSE','PATCH','EXECUTE','PUBLISH')),
  target_selector TEXT NOT NULL DEFAULT '*',
  risk_tier TEXT NOT NULL CHECK(risk_tier IN ('low','medium','high','critical')),
  allowed INTEGER NOT NULL DEFAULT 1, require_approval INTEGER NOT NULL DEFAULT 0,
  require_reversible INTEGER NOT NULL DEFAULT 0, require_provenance INTEGER NOT NULL DEFAULT 0,
  require_signature INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_action_policies_run ON action_policies(run_id, action_class);

CREATE TABLE IF NOT EXISTS team_budgets (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, team_id TEXT NOT NULL,
  budget_type TEXT NOT NULL CHECK(budget_type IN ('usd','tokens','tool_calls','minutes')),
  window_scope TEXT NOT NULL DEFAULT 'run' CHECK(window_scope IN ('run','cycle')),
  limit_value REAL NOT NULL DEFAULT 0, consumed_value REAL NOT NULL DEFAULT 0,
  hard_limit INTEGER NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(run_id, team_id, budget_type)
);

CREATE TABLE IF NOT EXISTS budget_events (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, team_id TEXT, role TEXT,
  cycle_number INTEGER,
  budget_type TEXT NOT NULL CHECK(budget_type IN ('usd','tokens','tool_calls','minutes')),
  delta_value REAL NOT NULL, reason TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_events_run ON budget_events(run_id);

CREATE TABLE IF NOT EXISTS workspace_locks (
  lock_key TEXT PRIMARY KEY, holder_id TEXT NOT NULL, run_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','released','expired')),
  lease_expires_at TEXT NOT NULL, heartbeat_at DATETIME,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workspace_locks_status ON workspace_locks(status, lease_expires_at);

CREATE TABLE IF NOT EXISTS run_checkpoints (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, cycle_number INTEGER NOT NULL,
  stage TEXT NOT NULL, state_json TEXT NOT NULL, git_head TEXT,
  best_score REAL NOT NULL DEFAULT 0, plateau_count INTEGER NOT NULL DEFAULT 0,
  consecutive_rejects INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_run_checkpoints_run ON run_checkpoints(run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS recovery_events (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, event_type TEXT NOT NULL,
  summary TEXT NOT NULL, details_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recovery_events_run ON recovery_events(run_id);

CREATE TABLE IF NOT EXISTS incident_log (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('info','warn','error','critical')),
  component TEXT NOT NULL, summary TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}', resolved INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_incident_log_run ON incident_log(run_id, resolved);

CREATE TABLE IF NOT EXISTS artifact_manifests (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, action_id TEXT,
  artifact_path TEXT NOT NULL, artifact_kind TEXT NOT NULL, mime_type TEXT,
  bytes INTEGER, sha256 TEXT NOT NULL, parent_sha256 TEXT, signature TEXT,
  signer TEXT, immutable INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_artifact_manifests_run ON artifact_manifests(run_id);

-- ── Provenance ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_registry (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, cycle_number INTEGER, task_id TEXT,
  role TEXT NOT NULL, claim_text TEXT NOT NULL, claim_hash TEXT NOT NULL,
  support_level TEXT NOT NULL DEFAULT 'unsupported'
    CHECK(support_level IN ('supported','partial','unsupported','contradicted')),
  evidence_pack_id TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_claim_registry_run ON claim_registry(run_id, claim_hash);

CREATE TABLE IF NOT EXISTS claim_citations (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claim_registry(id) ON DELETE CASCADE,
  citation_label TEXT NOT NULL, confidence REAL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_claim_citations_claim ON claim_citations(claim_id);

CREATE TABLE IF NOT EXISTS provenance_reports (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, cycle_number INTEGER, role TEXT,
  evidence_pack_id TEXT, total_claims INTEGER NOT NULL DEFAULT 0,
  linked_claims INTEGER NOT NULL DEFAULT 0, report_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_provenance_reports_run ON provenance_reports(run_id);

-- ── Tooling ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_policies (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, team_id TEXT, role TEXT NOT NULL,
  tool_name TEXT NOT NULL, allowed INTEGER NOT NULL DEFAULT 1,
  max_calls_per_cycle INTEGER NOT NULL DEFAULT 4,
  max_calls_per_run INTEGER NOT NULL DEFAULT 30,
  require_evidence INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tool_policies_run ON tool_policies(run_id, role, tool_name);

CREATE TABLE IF NOT EXISTS tool_artifacts (
  id TEXT PRIMARY KEY, execution_id TEXT NOT NULL, artifact_type TEXT NOT NULL,
  source_uri TEXT, title TEXT, excerpt TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tool_artifacts_exec ON tool_artifacts(execution_id);

CREATE TABLE IF NOT EXISTS evidence_packs (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, cycle_number INTEGER NOT NULL,
  task_id TEXT, team_id TEXT, owner_role TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'role_task', summary TEXT,
  item_count INTEGER NOT NULL DEFAULT 0, artifact_path TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_evidence_packs_run ON evidence_packs(run_id, cycle_number);

CREATE TABLE IF NOT EXISTS evidence_items (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL REFERENCES evidence_packs(id) ON DELETE CASCADE,
  execution_id TEXT, source_uri TEXT, title TEXT, excerpt TEXT, confidence REAL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_evidence_items_pack ON evidence_items(pack_id);

-- ── Runtime / pipeline / dreams ────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_steps (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, cycle_id TEXT,
  step_name TEXT NOT NULL, step_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','failed','skipped')),
  error_msg TEXT, duration_ms INTEGER,
  started_at DATETIME NOT NULL DEFAULT (datetime('now')), ended_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_run ON pipeline_steps(run_id, cycle_id);

CREATE TABLE IF NOT EXISTS cycle_context (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, cycle_id TEXT NOT NULL,
  agent_role TEXT NOT NULL, system_prompt TEXT NOT NULL, user_message TEXT NOT NULL,
  response TEXT, created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(cycle_id, agent_role)
);
CREATE INDEX IF NOT EXISTS idx_cycle_context_cycle ON cycle_context(cycle_id);

CREATE TABLE IF NOT EXISTS dream_runs (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, cycle_number INTEGER NOT NULL,
  triggered_by TEXT NOT NULL DEFAULT 'schedule',
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
  started_at DATETIME NOT NULL DEFAULT (datetime('now')), ended_at DATETIME,
  duration_ms INTEGER, transcripts_scanned INTEGER NOT NULL DEFAULT 0,
  transcript_entries INTEGER NOT NULL DEFAULT 0,
  facts_extracted INTEGER NOT NULL DEFAULT 0, facts_updated INTEGER NOT NULL DEFAULT 0,
  contradictions_found INTEGER NOT NULL DEFAULT 0,
  contradictions_resolved INTEGER NOT NULL DEFAULT 0,
  patterns_identified INTEGER NOT NULL DEFAULT 0,
  anti_patterns_identified INTEGER NOT NULL DEFAULT 0,
  memory_index_lines_before INTEGER, memory_index_lines_after INTEGER,
  dream_quality_score REAL, dream_report TEXT, raw_llm_output TEXT,
  llm_cost_usd REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_dream_runs_run ON dream_runs(run_id, cycle_number);

CREATE TABLE IF NOT EXISTS memory_snapshots_v2 (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, dream_run_id TEXT,
  cycle_number INTEGER NOT NULL, tier TEXT NOT NULL, file_path TEXT NOT NULL,
  content TEXT NOT NULL, content_hash TEXT NOT NULL,
  line_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_memory_snapshots_v2_run ON memory_snapshots_v2(run_id, tier);

CREATE TABLE IF NOT EXISTS mission_snapshots (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, cycle_number INTEGER NOT NULL,
  snapshot_path TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mission_snapshots_run ON mission_snapshots(run_id);

CREATE TABLE IF NOT EXISTS ultraplan_sessions (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, cycle_number INTEGER NOT NULL,
  trigger_reason TEXT NOT NULL, planner_model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','failed','rejected')),
  approval_required INTEGER NOT NULL DEFAULT 1, prompt TEXT NOT NULL,
  result_text TEXT, duration_ms INTEGER, cost_usd REAL NOT NULL DEFAULT 0,
  completed_at DATETIME, created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ultraplan_sessions_run ON ultraplan_sessions(run_id);

CREATE TABLE IF NOT EXISTS delegated_tasks (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, team_id TEXT,
  cycle_number INTEGER NOT NULL, from_role TEXT NOT NULL, to_role TEXT NOT NULL,
  task_type TEXT NOT NULL, instruction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','in_progress','completed','failed')),
  result_summary TEXT,
  updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_delegated_tasks_run ON delegated_tasks(run_id, status);

CREATE TABLE IF NOT EXISTS dynamic_roles (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, role_name TEXT NOT NULL,
  assignment_reason TEXT NOT NULL, assigned_at_cycle INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(run_id, role_name)
);

CREATE TABLE IF NOT EXISTS strategic_pivots (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, cycle_number INTEGER NOT NULL,
  pivot_type TEXT NOT NULL, proposed_plan_md TEXT NOT NULL,
  reasoning_json TEXT NOT NULL DEFAULT '{}',
  approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(approval_status IN ('pending','approved','rejected','applied')),
  applied_at DATETIME, created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_strategic_pivots_run ON strategic_pivots(run_id, cycle_number);

CREATE TABLE IF NOT EXISTS reflection_reports (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, cycle_number INTEGER NOT NULL,
  debt_score REAL NOT NULL DEFAULT 0, critique_md TEXT NOT NULL,
  bottlenecks_json TEXT NOT NULL DEFAULT '[]',
  suggested_pivots_json TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reflection_reports_run ON reflection_reports(run_id);

CREATE TABLE IF NOT EXISTS regression_alarms (
  id TEXT PRIMARY KEY, benchmark_run_id TEXT, metric_name TEXT NOT NULL,
  subject_key TEXT, baseline_value REAL NOT NULL, current_value REAL NOT NULL,
  delta_value REAL NOT NULL, threshold_value REAL NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warn'
    CHECK(severity IN ('info','warn','error','critical')),
  explanation_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_regression_alarms_metric ON regression_alarms(metric_name, created_at DESC);

CREATE TABLE IF NOT EXISTS replay_sessions (
  id TEXT PRIMARY KEY, source_run_id TEXT, source_attempt_id TEXT,
  mode TEXT NOT NULL DEFAULT 'deterministic',
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','failed')),
  artifact_path TEXT, summary_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS multi_objectives (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL,
  quality_weight REAL NOT NULL DEFAULT 0.5,
  speed_weight REAL NOT NULL DEFAULT 0.25,
  cost_weight REAL NOT NULL DEFAULT 0.25,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(run_id)
);

CREATE TABLE IF NOT EXISTS leaderboards (
  id TEXT PRIMARY KEY, leaderboard_type TEXT NOT NULL, suite_id TEXT,
  subject_key TEXT NOT NULL, samples INTEGER NOT NULL DEFAULT 0,
  average_score REAL, average_gold_match REAL, average_cost_usd REAL,
  average_latency_ms REAL, average_policy_compliance REAL, pass_rate REAL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leaderboards_type ON leaderboards(leaderboard_type, average_score DESC);

-- ── Portfolio / tournament ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolio_runs (
  id TEXT PRIMARY KEY, mode TEXT NOT NULL DEFAULT 'best_of_n',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','running','completed','failed')),
  mission_summary TEXT, mission_hash TEXT,
  initial_budget_usd REAL NOT NULL DEFAULT 0,
  remaining_budget_usd REAL NOT NULL DEFAULT 0,
  round_limit INTEGER NOT NULL DEFAULT 1, final_artifact_path TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')), finished_at DATETIME
);

CREATE TABLE IF NOT EXISTS portfolio_variants (
  id TEXT PRIMARY KEY,
  portfolio_run_id TEXT NOT NULL REFERENCES portfolio_runs(id) ON DELETE CASCADE,
  variant_key TEXT NOT NULL, display_name TEXT,
  role_mix_json TEXT NOT NULL DEFAULT '{}', model_map_json TEXT NOT NULL DEFAULT '{}',
  constitution_variant TEXT, template_variant TEXT,
  branch_name TEXT, worktree_path TEXT,
  allocated_budget_usd REAL NOT NULL DEFAULT 0,
  prior_score REAL, latest_score REAL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','running','completed','failed','eliminated')),
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_portfolio_variants_run ON portfolio_variants(portfolio_run_id);

CREATE TABLE IF NOT EXISTS portfolio_rounds (
  id TEXT PRIMARY KEY,
  portfolio_run_id TEXT NOT NULL REFERENCES portfolio_runs(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(portfolio_run_id, round_number)
);

CREATE TABLE IF NOT EXISTS portfolio_variant_runs (
  id TEXT PRIMARY KEY,
  portfolio_round_id TEXT NOT NULL REFERENCES portfolio_rounds(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL, autoorg_run_id TEXT, score REAL,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio_allocations (
  id TEXT PRIMARY KEY,
  portfolio_run_id TEXT NOT NULL REFERENCES portfolio_runs(id) ON DELETE CASCADE,
  portfolio_round_id TEXT NOT NULL REFERENCES portfolio_rounds(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL, allocation_type TEXT NOT NULL,
  amount_usd REAL NOT NULL DEFAULT 0, rationale_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio_syntheses (
  id TEXT PRIMARY KEY,
  portfolio_run_id TEXT NOT NULL REFERENCES portfolio_runs(id) ON DELETE CASCADE,
  portfolio_round_id TEXT NOT NULL REFERENCES portfolio_rounds(id) ON DELETE CASCADE,
  synthesis_type TEXT NOT NULL,
  source_variant_ids_json TEXT NOT NULL DEFAULT '[]',
  summary_json TEXT NOT NULL DEFAULT '{}', artifact_path TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS judge_council_votes (
  id TEXT PRIMARY KEY, portfolio_run_id TEXT NOT NULL, portfolio_round_id TEXT,
  judge_name TEXT NOT NULL, judge_model TEXT,
  subject_kind TEXT NOT NULL, subject_ref TEXT NOT NULL, voted_variant_id TEXT,
  score REAL NOT NULL DEFAULT 0, reasoning_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_judge_council_votes_run ON judge_council_votes(portfolio_run_id);

-- ── Swarm / inter-org economy ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_registry (
  id TEXT PRIMARY KEY, run_id TEXT, service_key TEXT NOT NULL,
  display_name TEXT NOT NULL, capability_md TEXT NOT NULL,
  unit_price_credits REAL NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_service_registry_key ON service_registry(service_key);

CREATE TABLE IF NOT EXISTS inter_org_contracts (
  id TEXT PRIMARY KEY, master_run_id TEXT NOT NULL, contractor_run_id TEXT,
  service_key TEXT NOT NULL, task_payload_json TEXT NOT NULL DEFAULT '{}',
  budget_credits REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'offered'
    CHECK(status IN ('offered','accepted','fulfilled','settled','cancelled')),
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inter_org_contracts_master ON inter_org_contracts(master_run_id);

CREATE TABLE IF NOT EXISTS swarm_bus_messages (
  id TEXT PRIMARY KEY, sender_run_id TEXT NOT NULL, receiver_run_id TEXT NOT NULL,
  message_type TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}',
  is_delivered INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_swarm_bus_receiver ON swarm_bus_messages(receiver_run_id, is_delivered);

-- ── Platform / hosted mode ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, slug TEXT NOT NULL,
  display_name TEXT NOT NULL, repo_url TEXT, root_path TEXT NOT NULL,
  isolation_mode TEXT NOT NULL DEFAULT 'directory'
    CHECK(isolation_mode IN ('directory','container','remote')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('provisioning','active','archived','error')),
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS hosted_runs (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL DEFAULT 'ten_default',
  workspace_id TEXT NOT NULL, mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','running','completed','failed','cancelled')),
  request_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  started_at DATETIME, finished_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_hosted_runs_tenant ON hosted_runs(tenant_id, status);

CREATE TABLE IF NOT EXISTS remote_agents (
  id TEXT PRIMARY KEY, tenant_id TEXT, display_name TEXT,
  status TEXT NOT NULL DEFAULT 'offline'
    CHECK(status IN ('offline','idle','busy','draining','error')),
  public_key TEXT, metadata_json TEXT NOT NULL DEFAULT '{}',
  registered_at DATETIME NOT NULL DEFAULT (datetime('now')), heartbeat_at DATETIME
);

-- ── Observability ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS websocket_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, event_type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_websocket_events_run ON websocket_events(run_id, id DESC);

-- ── FTS5 BM25 index over transcripts ───────────────────────────────
CREATE VIRTUAL TABLE IF NOT EXISTS transcript_fts USING fts5(
  content,
  content='transcript_index',
  content_rowid='rowid',
  tokenize='porter unicode61'
);
