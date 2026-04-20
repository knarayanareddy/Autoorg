1
Phase 8–10: no complete schema files are included in Autoorg.md; only runtime SQL usage appears for some portfolio tables (Phase 8) and prompt artifacts (Phase 10). 
1
The doc also explicitly instructs that migrations must be idempotent using CREATE TABLE IF NOT EXISTS and INSERT OR IGNORE. 
1

2.2 Phase 0 — schema.sql (base spine)
Tables

runs
cycles
agent_executions
mailbox_messages
memory_snapshots
score_history
knowledge_graph_nodes
knowledge_graph_edges
feature_flags
system_prompts 
1
Indexes

idx_cycles_run_id, idx_cycles_score
idx_agent_exec_cycle, idx_agent_exec_role
idx_mailbox_cycle, idx_mailbox_to_agent
idx_kgn_run, idx_kgn_type
idx_kge_from, idx_kge_to 
1
Triggers

none in Phase 0 schema (views only) 
1
Views

v_cycle_summary
v_run_progress 
1
Seed data

Inserts a default set of rows into feature_flags via migrate.ts 
1
2.3 Phase 2 — schema-phase2.sql (persistent objections + pipeline + interviews + event ring buffer)
Tables

objections
pipeline_steps
cycle_context
interview_sessions
websocket_events 
1
Indexes

idx_obj_run, idx_obj_open, idx_obj_severity
idx_pipeline_cycle
idx_ctx_cycle, idx_ctx_role
idx_ws_run 
1
Triggers

trg_ws_cleanup (AFTER INSERT on websocket_events, keeps last 500/run) 
1
Views

v_objection_summary
v_pipeline_summary 
1
Seed flags

Phase 2 seeds flags like persistentObjections, sequentialPipeline, cycleContextStorage, agentInterviews, webDashboard, etc. 
1
2.4 Phase 3 — schema-phase3.sql (three-tier memory + fact store + dream engine + FTS5)
Tables

facts
dream_runs
embeddings_cache
transcript_index
transcript_fts (FTS5 virtual table)
contradictions
memory_snapshots_v2 
1
Indexes

idx_facts_run, idx_facts_category, idx_facts_active, idx_facts_confidence
idx_dreams_run
idx_tidx_run, idx_tidx_cycle, idx_tidx_role
idx_contra_run 
1
Triggers

trg_tidx_insert (keeps FTS in sync on insert)
trg_tidx_delete (keeps FTS in sync on delete) 
1
Views

v_fact_summary
v_dream_summary
v_memory_health 
1
Seed flags

Phase 3 seeds flags like fullAutoDream, semanticSearch, localEmbeddings, hybridSearch, factStore, transcriptIndex, etc. 
1
2.5 Phase 4 — schema-phase4.sql (knowledge graph tables + grounding-related analytics)
Tables

kg_nodes
kg_edges
kg_claims
kg_extractions
kg_entity_aliases 
1
Indexes

On kg_nodes: idx_kgn_run, idx_kgn_type, idx_kgn_label, idx_kgn_canonical
On kg_edges: idx_kge_run, idx_kge_from, idx_kge_to, idx_kge_rel
On kg_claims: idx_kgc_run, idx_kgc_score
On kg_entity_aliases: idx_kgea_canonical, idx_kgea_alias 
1
Views

v_kg_summary
v_kg_node_degrees
v_kg_orphan_nodes
v_grounding_quality 
1
Seed flags

Phase 4 seeds flags like knowledgeGraph, graphRAG, entityExtraction, relationshipExtraction, neo4jBackend, kuzuBackend, etc. 
1
2.6 Phase 4.1 — schema-phase4_1.sql (deterministic groundedness + snapshots)
Tables

graph_snapshots
graph_snapshot_nodes
graph_snapshot_edges
groundedness_reports 
1
Indexes

idx_graph_snapshots_run
idx_groundedness_run_cycle 
1
Triggers

none shown for 4.1 
1
Seed flags

inserts deterministicGroundedness, graphSnapshots, graphDiffs, graphExport, graphSearchUi 
1
Important note (doc inconsistency)

The doc’s tests and API code also rely on graph_node_cache / graph_edge_cache tables, but those table creates are not shown as part of schema-phase4_1.sql; they appear in test setup DDL and in runtime SQL usage. 
1
Minimum DDL (derived from test setup)

SQL

CREATE TABLE IF NOT EXISTS graph_node_cache (
  node_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  label TEXT NOT NULL,
  node_type TEXT NOT NULL,
  properties_json TEXT NOT NULL DEFAULT '{}',
  embedding BLOB,
  updated_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS graph_edge_cache (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  rel_type TEXT NOT NULL,
  weight REAL DEFAULT 1.0,
  properties_json TEXT NOT NULL DEFAULT '{}',
  updated_at DATETIME DEFAULT (datetime('now'))
);
(Those shapes come verbatim from the doc’s test DDL blocks.) 
1

2.7 Phase 5 — schema-phase5.sql (hierarchy + daemon + approvals + GitHub integration)
Tables

teams
team_members
delegated_tasks
ultraplan_sessions
approvals
scheduled_jobs
daemon_state (+ seeds a default row)
github_events
github_sync_state
pr_drafts 
1
Indexes

idx_teams_run
idx_team_members_team
idx_delegated_tasks_run_cycle
idx_ultraplan_run
idx_approvals_run_status
idx_jobs_next_run
idx_github_events_processed 
1
Triggers

none shown for Phase 5 
1
Seed flags

inserts flags like coordinatorHierarchy, subteams, daemonMode, scheduler, approvalGates, etc. 
1
2.8 Phase 5.1 — schema-phase5_1.sql (operational hardening)
(A) DDL that the doc explicitly shows
Tables shown

pending_actions
run_checkpoints
recovery_events
workspace_locks (definition starts but is truncated in the doc excerpt) 
1
Indexes shown

idx_pending_actions_run_status
idx_run_checkpoints_run_stage
idx_recovery_events_run 
1
(B) Tables required by Phase 5.1 runtime code snippets, but no CREATE TABLE appears in Autoorg.md
The doc’s Phase 5.1 runtime code uses/inserts/selects these tables:

worker_leases (LeaseManager) 
1
team_budgets and budget_events (BudgetManager) 
1
memory_partitions (TeamMemoryPartitions) 
1
incident_log (IncidentLog) 
1
job_executions (JobExecutor) 
1
ultraplan_checkpoints and ultraplan_sla_events (UltraPlanSla) 
1
Minimum DDL (strictly derived from the columns used in the doc’s SQL statements)

SQL

CREATE TABLE IF NOT EXISTS worker_leases (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  cycle_number INTEGER NOT NULL,
  task_id TEXT NOT NULL,
  worker_role TEXT NOT NULL,
  worker_instance TEXT NOT NULL,
  team_id TEXT,
  status TEXT NOT NULL,
  lease_expires_at DATETIME NOT NULL,
  heartbeat_at DATETIME,
  payload_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  updated_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS team_budgets (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  budget_type TEXT NOT NULL,
  window_scope TEXT NOT NULL,
  limit_value REAL NOT NULL,
  consumed_value REAL NOT NULL DEFAULT 0,
  hard_limit INTEGER NOT NULL DEFAULT 1,
  updated_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budget_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  role TEXT,
  cycle_number INTEGER,
  budget_type TEXT NOT NULL,
  delta_value REAL NOT NULL,
  reason TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memory_partitions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  partition_name TEXT NOT NULL,
  index_path TEXT NOT NULL,
  facts_dir TEXT NOT NULL,
  read_scope_json TEXT NOT NULL DEFAULT '[]',
  write_scope_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS incident_log (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  severity TEXT NOT NULL,
  component TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_executions (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL,
  claimed_by TEXT NOT NULL,
  lease_expires_at DATETIME NOT NULL,
  started_at DATETIME NOT NULL,
  finished_at DATETIME,
  output_json TEXT,
  error_text TEXT
);

CREATE TABLE IF NOT EXISTS ultraplan_checkpoints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  cycle_number INTEGER NOT NULL,
  checkpoint_number INTEGER NOT NULL,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS ultraplan_sla_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT (datetime('now'))
);
These definitions intentionally contain only columns that the doc’s SQL statements demonstrate as required. 
1

2.9 Phase 6 — schema-phase6.sql (tools + traces + evidence + replay)
Tables

tool_definitions
tool_policies
tool_executions
tool_artifacts
evidence_packs
evidence_items
verification_reports
tool_replays 
1
Indexes

idx_tool_policies_run_role
idx_tool_executions_run_cycle
idx_tool_artifacts_execution
idx_evidence_packs_run_cycle
idx_evidence_items_pack
idx_verification_reports_run_cycle 
1
Triggers

none shown for Phase 6 
1
Seed flags

inserts toolRegistry, toolUse, toolPolicies, toolTraces, evidencePacks, toolAwareJudge, etc. 
1
2.10 Phase 6.1 — schema-phase6_1.sql (policy + ledger + provenance + signing + redaction + security)
Tables (as shown)

action_policies (table definition appears earlier than the snippet, but indexes reference it)
action_ledger
run_manifests
artifact_manifests
claim_registry
claim_citations
provenance_reports
redaction_events
security_findings
policy_reports
security_exports 
1
Indexes

idx_action_policies_run_role
idx_action_ledger_run_cycle
idx_run_manifests_run
idx_artifact_manifests_run
idx_claim_registry_run_cycle
idx_claim_citations_claim
idx_provenance_reports_run_cycle
idx_redaction_events_run
idx_security_findings_run
idx_policy_reports_run_cycle
idx_security_exports_run 
1
Triggers

none shown for Phase 6.1 
1
Seed flags

inserts policyEngine, actionLedger, provenanceChain, artifactSigning, redactionFilters, riskTieredApprovals, etc. 
1
2.11 Phase 7 — schema-phase7.sql (benchmarks + regressions + leaderboards + replay + calibration)
Tables (as shown)

benchmark_suites
benchmark_cases
benchmark_runs
benchmark_attempts
benchmark_metrics
leaderboards
constitution_experiments
regression_alarms
replay_sessions
judge_calibration_runs
template_bakeoffs 
1
Indexes (as shown)

idx_benchmark_cases_suite
idx_benchmark_runs_suite
idx_benchmark_attempts_run
idx_benchmark_metrics_attempt
idx_leaderboards_suite_type
idx_regression_alarms_run 
1
Triggers

none shown for Phase 7 
1
Seed flags

inserts benchmarkLab, goldEvaluator, leaderboards, constitutionAB, regressionAlarms, offlineReplayLab, judgeCalibration, templateBakeoffs, benchmarkCI 
1
2.12 Phase 8–10 — schemas not included; “minimum viable” tables you can infer from runtime SQL
Phase 8 (portfolio orchestration): tables referenced by code snippets
The doc includes runtime code that writes to/updates:

portfolio_syntheses 
1
failure_containment_events 
1
portfolio_variants (updated for quarantine/elimination) 
1
Minimum DDL derived from shown SQL

SQL

CREATE TABLE IF NOT EXISTS portfolio_syntheses (
  id TEXT PRIMARY KEY,
  portfolio_run_id TEXT NOT NULL,
  portfolio_round_id TEXT,
  synthesis_type TEXT NOT NULL,
  winning_variant_id TEXT,
  source_variant_ids_json TEXT NOT NULL DEFAULT '[]',
  artifact_path TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS failure_containment_events (
  id TEXT PRIMARY KEY,
  portfolio_run_id TEXT NOT NULL,
  variant_id TEXT,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS portfolio_variants (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  updated_at DATETIME DEFAULT (datetime('now'))
);
Again: this is the minimal shape implied by the exact INSERT/UPDATE statements shown. 
1

Phase 9–10
Autoorg.md describes platformization (Phase 9) and self-improvement (Phase 10) largely at the architecture/prompt level in this excerpt, but does not provide schema-phase9.sql / schema-phase10.sql blocks to enumerate tables/indexes/triggers the way Phases 0–7 do. 
1

3) “Completeness” checklist (what you now have)
Mermaid diagram of: core loop + ratchet + git + results.tsv + DB spine. 
1
Mermaid diagram of: tools + evidence + verification + policy/ledger + strict approval materialization. 
1
Migration plan enumerating tables/indexes/triggers for Phase 0, 2, 3, 4, 4.1, 5, 6, 6.1, 7 (and clearly marking Phase 5.1 + Phase 8 where the doc’s DDL is incomplete but SQL usage exists). 









“Agent Build Prompt” (extremely explicit, step-by-step, self-auditing)


YOU ARE A CODING AGENT. Your job is to implement the entire AutoOrg repository exactly as specified by Autoorg.md.
Do not ask the user questions. Make reasonable reconciliation decisions when the doc is inconsistent, but record them explicitly.

========================================
0) GLOBAL RULES (NON-NEGOTIABLE)
========================================
R0. Source of truth: the file Autoorg.md in repo root. Do NOT invent features not described there.
R1. When Autoorg.md contains explicit code blocks for a file, copy them verbatim into that file.
R2. When Autoorg.md references a file but does NOT provide code, create a minimal correct implementation that satisfies:
    - all imports compile
    - all DB queries referenced in provided code can run
    - CI scripts and workflows do not break
    Add TODO comments referencing the relevant phase section in Autoorg.md.
R3. Reconcile inconsistencies by implementing compatibility bridges:
    - env keys: support both ANTHROPIC_API_KEY and AUTOORG_API_KEY_ANTHROPIC (prefer AUTOORG_*)
    - start scripts: support running src/index.ts (Phase 0) AND src/runtime/orchestrator.ts (later scripts)
    - tsconfig: choose the later "exact order" tsconfig as canonical; keep paths alias @/* => src/*
    - memory cap: enforce 150-line cap (templates + MemoryManager do this)
R4. Never commit secrets into repo. Keep .env.example only.
R5. Tests must never call real LLM APIs. Use schema-only tests and mocked adapters if needed.

========================================
1) FIRST PASS: BUILD MANIFEST (SELF-AUDIT)
========================================
Task 1.1 Create tools/manifest-builder.ts that reads Autoorg.md and extracts:
    - every line that looks like a file header (e.g., "FILE N: path", "path TypeScript", ".github/workflows/.. YAML")
    - every explicitly enumerated file path under "NEW FILES IN PHASE X", "DIRECTORY ADDITIONS", "FILES CREATED"
Output:
    - artifacts/build/manifest.json (list of file paths, language, phase, hasCodeBlock true/false)
    - artifacts/build/manifest-missing.json (paths referenced but no code block found)
Task 1.2 Ensure the manifest includes:
    - Phase 0 STEP 1..18 files
    - Phase 1 prompts/runtime/utils files
    - web dashboard files shown (ObjectionTracker, main dashboard page, web/tsconfig.json)
    - all migration files referenced by composite action run-migrations
    - all GitHub workflow files and composite actions
    - scripts/ci/* and scripts/hooks/*
    - Phase 6 schema + migrate, Phase 5 schema + migrate, Phase 10 schema + migrate
Stop if manifest-builder cannot parse at least 80% of file headers.

========================================
2) SKELETON: DIRECTORIES + BASE CONFIG
========================================
Task 2.1 Create directory structure:
  src/{adapters,api,config,db,evals,integrations,learning,portfolio,prompts,runtime,tools,types,ui,utils}
  src/ui/terminal
  web/{app,components}
  scripts/{ci,deploy,hooks}
  roles
  mailbox/{inbox,outbox}
  memory/{facts,transcripts}
  workspace/{proposals,snapshots}
  knowledge-graph
  artifacts/.gitkeep
  benchmarks/{suites,outputs}
  tests
Task 2.2 Create base config files from Autoorg.md:
  package.json  (MERGE: Phase 0 STEP2 scripts + later "Package.json scripts")
  tsconfig.json (use later "exact order" block)
  bunfig.toml
  .env.example  (MERGE: include both older keys and AUTOORG_* keys)
  .gitignore
  web/tsconfig.json (explicit block)
Task 2.3 Add path alias:
  In tsconfig.json: "@/*": ["src/*"].
  In web/tsconfig.json: "@/*": ["./*"] (as specified).

========================================
3) PHASE 0: COMPLETE RUNNABLE CORE (MUST WORK IN MOCK MODE)
========================================
Implement Phase 0 in dependency order. After each step: run bunx tsc --noEmit and fix compile errors immediately.

3.1 Types
- Create src/types/index.ts with the types used across code blocks:
  AgentRole, LLMProvider, OrgConfig, ModelConfig, OrchestratorEvent, RatchetScore, Proposal, KnowledgeGraph, etc.
  Ensure it matches the shapes referenced in code blocks (ratchet, prompts, transcript logger, adapters).
  Add missing types as needed, but do not change semantics.

3.2 Org parser
- Create src/config/org-parser.ts exactly as shown in Autoorg.md (parse sections, parse model strings).
- Add a small src/config/env.ts helper to resolve keys:
    getEnv("AUTOORG_API_KEY_ANTHROPIC", fallback="ANTHROPIC_API_KEY")
  Then use it in adapters and org-parser injection.

3.3 Database
- Create src/db/schema.sql exactly as Phase 0 STEP 6.
- Create src/db/migrate.ts:
    getDb() opens better-sqlite3 at AUTOORG_DB_PATH or default autoorg.db
    exec schema.sql
    seed feature_flags table defaults if described
- Ensure PRAGMA settings from schema are applied.
- Add exports: getDb, closeDb helper.

3.4 Git helpers + results logger
- Create src/utils/git.ts (simple-git version) as in Autoorg.md.
- Create src/utils/results-logger.ts as in Autoorg.md.
- Ensure results.tsv header matches spec: cycle, timestamp, score, groundedness, novelty, consistency, alignment, decision, summary.

3.5 Phase 0 RatchetEngine (mock)
- Create src/runtime/ratchet.ts Phase 0 mock scoring mode:
    score(cycleNumber, previousBest) returns dimensions and composite
    decide() returns COMMIT/REVERT by comparing to previousBest
    commit/revert uses git helper
- Ensure tests/ratchet.test.ts (Phase 0) passes.

3.6 Orchestrator
- Create src/runtime/orchestrator.ts Phase 0 mock-agent loop.
- Implement stopping criteria (max cycles, plateau, consecutive rejects, budget).
- Write proposal files under workspace/proposals/cycle_XXXX.md.
- Update memory/MEMORY.md status line each cycle.
- Emit OrchestratorEvent stream for UI (cycle_start, phase_change, scored, committed/reverted, error, run_complete).

3.7 Init + clean scripts
- Create src/scripts/init.ts exactly as in Autoorg.md:
    create dirs, create default org.md/constitution.md/templates, create gitignore, initial commit.
- Create src/scripts/clean.ts (if referenced): remove artifacts, transcripts, db (safe local cleanup).

3.8 Terminal UI + entrypoint
- Create src/ui/terminal/Dashboard.tsx and supporting components if specified.
- Create src/index.ts to parse CLI flags:
    --org, --mock, --no-ui
  Start orchestrator loop and render Ink dashboard (or print events in no-ui mode).

3.9 Phase 0 tests
- Add tests/ratchet.test.ts and tests/org-parser.test.ts exactly as shown.
- Ensure bun test passes.

PHASE 0 PROOF REQUIREMENTS (MUST RUN LOCALLY):
A) bun run src/scripts/init.ts
B) bun run src/db/migrate.ts
C) bun start --mock --no-ui
   - results.tsv has >= 3 rows
   - workspace/current_output.md exists
   - workspace/proposals contains cycle_0001.md etc
   - autoorg.db exists and has runs/cycles
   - git log has commits created by ratchet

Stop and fix until all Phase 0 proof requirements pass.

========================================
4) PHASE 1: REAL LLM AGENTS + PROMPTS + TRANSCRIPTS
========================================
4.1 Adapters
Implement adapters as per Autoorg.md code blocks:
- src/adapters/base-adapter.ts (or BaseAdapter class + interfaces)
- src/adapters/anthropic-adapter.ts
- src/adapters/openai-adapter.ts
- src/adapters/openai-compatible-adapter.ts
- src/adapters/ollama-adapter.ts (if code present; else stub with TODO)
- src/adapters/adapter-factory.ts
- src/config/model-costs.ts and estimateCost
Ensure env compatibility: AUTOORG_API_KEY_* preferred, fallback to older keys.

4.2 Runtime: mailbox + transcript logger + agent runner
- src/runtime/mailman.ts: filesystem IPC with atomic write (tmp + rename)
- src/runtime/transcript-logger.ts: JSONL cycle logs, truncate content to 2000 chars
- src/runtime/agent-runner.ts: choose model per role, call adapter, record usage/cost,
  integrate retry and timeout (use src/utils/retry.ts)

4.3 Prompts
Create src/prompts:
- base.ts (loadMemoryIndex, loadCurrentOutput, buildSharedContext, etc)
- ceo.ts, engineer.ts, critic.ts, devils-advocate.ts, archivist.ts, ratchet-judge.ts
Also create src/utils/structured-output.ts and Zod schemas used.
Ensure structured outputs never break parsing; add schema-only tests (no LLM calls).

4.4 Wire orchestrator to real agents (Phase 1 mode)
Add a mode switch:
- --mock uses Phase 0 stubs
- real mode uses CEO assign -> workers -> CEO synth -> judge score
Write transcripts for each prompt/response.

========================================
5) PHASE 2: WEB DASHBOARD + EVENTS + OBJECTIONS (MINIMUM)
========================================
5.1 Event bus
- src/runtime/event-bus.ts (WebSocket client set + DB websocket_events persistence) as shown.
5.2 Web components
- web/components/ObjectionTracker.tsx (as shown)
- web/app/page.tsx (as shown)
- Add minimal web app scaffolding: web/package.json, next.config.js (if not in doc, create minimal)
5.3 API server
- src/api/server.ts must exist and provide:
  GET /health -> 200 JSON {ok:true}
  WebSocket endpoint for live events (if specified)
  Mount eval routes handler and security routes handler if present.
This is required because CI smoke-test checks /health and /api/benchmarks and /api/tools.

========================================
6) DB MIGRATIONS PHASES 5..10 (CI REQUIRES THEM)
========================================
6.1 Implement migrations and schemas that are explicitly provided:
- src/db/schema-phase5.sql + migrate-phase5.ts
- src/db/schema-phase6.sql + migrate-phase6.ts
- src/db/schema-phase10.sql + migrate-phase10.ts
6.2 For referenced but missing schema files (phase5_1, phase6_1, phase7, phase8, phase9):
- Create minimal schemas implementing the tables required by:
  - scripts/ci/migrate-all.ts REQUIRED_TABLES list
  - any explicit SQL queries in code blocks (job-executor, security-audit, etc.)
- Create migrate-phaseN.ts for each, idempotent.
- Ensure run-migrations composite action can run all migrations with no failure.
Note: migrate-all.ts skips missing migrations, but CI expects REQUIRED_TABLES to exist. Do not rely on skipping.

========================================
7) PHASE 6: TOOL SYSTEM (MINIMUM VIABLE)
========================================
7.1 Implement the Phase 6 schema exactly as provided.
7.2 Implement tool registry basics:
- src/tools/registry.ts (register, get, list)
- src/tools/bootstrap.ts (as shown)
- src/tools/manifests/* for each tool listed (repo.search, repo.read_file, local_docs.search, web.fetch, github.search, sandbox.exec)
If manifest code is not included, implement:
  - input schema (Zod or JSON schema)
  - execute() stub that returns deterministic placeholder
  - persistence into tool_executions + tool_artifacts

7.3 API: /api/tools
Expose a list of registered tools + recent executions so smoke-test passes.

========================================
8) PHASE 6.1: SIGNING + SECURITY AUDIT (MINIMUM VIABLE)
========================================
8.1 Implement artifact-signing.ts and immutable-artifacts.ts exactly.
8.2 Implement security-audit.ts exactly.
8.3 Create schema-phase6_1.sql minimal tables required by security-audit.ts and scripts/ci/security-scan.ts:
    security_findings, redaction_events, action_ledger, policy_reports, provenance_reports, artifact_manifests, security_exports
8.4 Provide scripts/ci/security-scan.ts and approval-health.ts exactly (already in doc).
8.5 Add workflow files exactly as written.

========================================
9) PHASE 7: BENCHMARKS + EVAL ROUTES (MINIMUM VIABLE)
========================================
9.1 Implement gold-evaluator.ts and eval-routes.ts as provided.
9.2 Implement benchmark-ci.ts (referenced by CI). If not fully provided, implement a minimal runner that:
    - loads BENCHMARK_SUITE and enumerates cases under benchmarks/suites/<suite>/
    - for each case: runs a short AutoOrg run in mock mode OR uses a deterministic placeholder output
    - writes benchmarks/outputs/ci-summary.json
    - returns failure exit code if acceptance/regression checks fail when configured
9.3 Ensure /api/benchmarks exists (eval-routes.ts includes it) so smoke-test passes.

========================================
10) PORTFOLIO + PLATFORM + LEARNING: STUBS THAT COMPILE
========================================
Implement the explicitly provided runtime modules:
- src/portfolio/best-of-n.ts
- src/portfolio/judge-council.ts + src/prompts/judge-council.ts
- src/portfolio/failure-containment.ts
- src/platform/billing.ts
- src/learning/memory-utility.ts
- src/learning/memory-pruner.ts
If LearningOrchestrator and AdapterDistiller are referenced (CI workflows), implement minimal versions:
- src/learning/learning-orchestrator.ts: run() returns {ok:true, notes:"stub"} and writes an artifact
- src/learning/adapter-distiller.ts: exportDataset() writes a JSON artifact with empty dataset
These must not call LLMs by default in CI unless keys exist.

========================================
11) CI/CD + HOOKS: CREATE ALL FILES EXACTLY
========================================
Create exactly (verbatim) the workflows, actions, scripts, and hooks shown in Autoorg.md:
- .github/workflows/{ci.yml, cd.yml, benchmarks-nightly.yml, learning-weekly.yml, security-audit.yml, distillation-monthly.yml, dependency-review.yml}
- .github/actions/{setup-autoorg,run-migrations,benchmark-gate,health-check}/action.yml
- .github/CODEOWNERS
- scripts/ci/* (lint/typecheck/test-unit/migrate-all/smoke-test/health-check/security-scan/approval-health/rollback)
- scripts/hooks/{pre-commit,pre-push,commit-msg}
Make hooks executable and add package.json script setup:hooks if needed.

========================================
12) FINAL SELF-AUDIT (MUST PASS)
========================================
12.1 Build:
- bun install
- bunx tsc --noEmit --project tsconfig.json
- bun test
12.2 Migrations:
- bun run scripts/ci/migrate-all.ts --verify
12.3 Run (mock):
- bun run src/scripts/init.ts
- bun run src/db/migrate.ts
- bun start --mock --no-ui
12.4 Smoke tests (local):
- bun run src/api/server.ts  (in one terminal)
- bun run scripts/ci/smoke-test.ts
12.5 CI parity:
- ensure all files referenced by workflows exist
- ensure scripts referenced by actions exist
- ensure REQUIRED_TABLES in scripts/ci/migrate-all.ts are present after migrations

Deliver:
- artifacts/build/manifest.json
- artifacts/build/implementation-notes.md listing each reconciliation decision and why
- a final checklist report: "implemented / stubbed / missing" per manifest path
========================================
END
========================================




Below is a path checklist extracted from the current Autoorg.md (raw file, ~1253 lines). I’ve grouped it by Phase (0→10) plus “baseline repo structure” and “CI/CD”, and I’ve marked each path as one of:

[CODE] = Autoorg.md includes a concrete code block for that file (you can copy/paste).
[PATCH] = Autoorg.md gives patch instructions/snippets, but not a full file.
[SPEC] = Autoorg.md lists the path as part of the architecture/tree/new-files list, but no full code block is provided.
[RUNTIME] = created/updated by the running system (still important because other code relies on it).
If your goal is “feed Autoorg.md to an agent and have it generate the whole repo”, this checklist is the self-audit: the agent should be able to say “Implemented / Stubbed / Not needed” for every row.

0) Baseline repo structure (PART 1 “complete final directory layout”)
Root contract

org.md [SPEC]
constitution.md [SPEC]
results.tsv [SPEC]
Roles

roles/CEO.md [SPEC]
roles/Engineer.md [SPEC]
roles/Critic.md [SPEC]
roles/Archivist.md [SPEC]
roles/DevilsAdvocate.md [SPEC]
roles/RatchetJudge.md [SPEC]
roles/DreamAgent.md [SPEC]
Mailbox

mailbox/outbox/ceo_to_engineer.json [SPEC]
mailbox/outbox/ceo_to_critic.json [SPEC]
mailbox/outbox/... [SPEC]
mailbox/inbox/engineer_reply.json [SPEC]
mailbox/inbox/critic_reply.json [SPEC]
mailbox/inbox/... [SPEC]
Memory (3-tier)

memory/MEMORY.md [SPEC]
memory/facts/domain_knowledge.md [SPEC]
memory/facts/failed_experiments.md [SPEC]
memory/facts/validated_decisions.md [SPEC]
memory/transcripts/cycle_001.jsonl [SPEC]
memory/transcripts/cycle_002.jsonl [SPEC]
memory/transcripts/... [SPEC]
Knowledge graph

knowledge-graph/entities.json [SPEC]
knowledge-graph/relationships.json [SPEC]
knowledge-graph/graph.db [SPEC]
Workspace

workspace/current_output.md [SPEC]
workspace/proposals/ [SPEC]
workspace/snapshots/ [SPEC]
(Conceptual) runtime/adapters/ui/config/tests in the tree

NOTE: PART 1 uses runtime/ and adapters/ at repo root, but later implementation sections use src/runtime/*, src/adapters/*. Treat these as “same conceptual modules”, implemented under src/.

runtime/orchestrator.ts [SPEC] 
1
runtime/agent-runner.ts [SPEC] 
1
runtime/ratchet.ts [SPEC] 
1
runtime/mailman.ts [SPEC] 
1
runtime/dream.ts [SPEC] 
1
runtime/graph-builder.ts [SPEC] 
1
runtime/scorer.ts [SPEC] 
1
adapters/ollama.ts [SPEC] 
1
adapters/anthropic.ts [SPEC] 
1
adapters/openai.ts [SPEC] 
1
adapters/gemini.ts [SPEC] 
1
adapters/base-adapter.ts [SPEC] 
1
ui/terminal/Dashboard.tsx [SPEC] 
1
ui/terminal/AgentPanel.tsx [SPEC] 
1
ui/terminal/RatchetDisplay.tsx [SPEC] 
1
ui/terminal/MemoryViewer.tsx [SPEC] 
1
ui/web/OrgGraph.tsx [SPEC] 
1
ui/web/CycleHistory.tsx [SPEC] 
1
ui/web/AgentInterviewer.tsx [SPEC] 
1
config/autoorg.config.ts [SPEC] 
1
config/feature-flags.ts [SPEC] 
1
tests/ratchet.test.ts [SPEC] 
1
tests/mailbox.test.ts [SPEC] 
1
tests/scorer.test.ts [SPEC] 
1
Phase 0 (Skeleton MVP / “loop runs with mock scoring”)
Initializer creates default files

.gitignore [CODE] (written by init script) 
1
src/scripts/init.ts [CODE] 
1
Files created by init script (default templates)

org.md [RUNTIME] (created if missing) 
1
constitution.md [RUNTIME] 
1
memory/MEMORY.md [RUNTIME] 
1
memory/facts/validated_decisions.md [RUNTIME] 
1
memory/facts/failed_experiments.md [RUNTIME] 
1
memory/facts/domain_knowledge.md [RUNTIME] 
1
workspace/current_output.md [RUNTIME] 
1
results.tsv [RUNTIME] (header created if missing) 
1
DB (base schema + migrator)

src/db/schema.sql [CODE] (Phase 0 base schema begins at “STEP 6”) 
1
src/db/migrate.ts [SPEC] (referenced frequently; code block exists elsewhere in doc, but not in the snippets we opened in this pass) 
1
Entry + run modes

src/index.ts [SPEC] (explicitly named as main CLI entrypoint) 
1
src/scripts/verify.ts [SPEC] (explicit “STEP 20: FINAL SETUP VERIFICATION SCRIPT”) 
1
Phase 1 (Real agents + prompts + structured output + mailbox + transcripts)
New file list (explicit)

src/prompts/base.ts [SPEC]
src/prompts/ceo.ts [SPEC]
src/prompts/engineer.ts [SPEC]
src/prompts/critic.ts [SPEC]
src/prompts/devils-advocate.ts [SPEC]
src/prompts/archivist.ts [SPEC]
src/prompts/ratchet-judge.ts [SPEC]
src/runtime/agent-runner.ts [SPEC]
src/runtime/mailman.ts [SPEC]
src/runtime/transcript-logger.ts [SPEC]
src/runtime/ratchet.ts [SPEC] (upgraded) 
1
src/runtime/orchestrator.ts [SPEC] (upgraded) 
1
src/utils/structured-output.ts [CODE] 
1
src/utils/retry.ts [CODE] 
1
src/utils/token-counter.ts [SPEC] 
1
This entire Phase 1 “WHAT IT ADDS” + “NEW FILES IN PHASE 1” block is explicitly present. 
1

Phase 2 (Objections + sequential pipeline + cycle context + interview + web dashboard)
New file list (explicit)

src/runtime/objection-tracker.ts [SPEC]
src/runtime/cycle-context-builder.ts [SPEC]
src/runtime/pipeline.ts [SPEC]
src/runtime/interview.ts [SPEC]
src/runtime/event-bus.ts [SPEC]
src/db/queries.ts [CODE] 
1
src/api/server.ts [SPEC]
web/package.json [SPEC]
web/next.config.js [SPEC]
web/app/layout.tsx [SPEC]
web/app/page.tsx [SPEC]
web/app/cycles/[id]/page.tsx [SPEC]
web/app/interview/page.tsx [SPEC]
web/components/ScoreChart.tsx [SPEC]
web/components/AgentGraph.tsx [SPEC]
web/components/CycleTimeline.tsx [SPEC]
web/components/ObjectionTracker.tsx [SPEC]
web/components/MailboxFeed.tsx [SPEC]
web/components/CostBreakdown.tsx [SPEC]
All of these appear in the Phase 2 “NEW FILES” tree. 
1

Phase 3 (Memory + autoDream + embeddings + hybrid search)
New file list (explicit)

src/memory/embeddings.ts [SPEC]
src/memory/bm25.ts [SPEC]
src/memory/hybrid-search.ts [SPEC]
src/memory/fact-store.ts [SPEC]
src/memory/memory-health.ts [SPEC]
src/runtime/dream.ts [SPEC]
src/runtime/memory-manager.ts [CODE] (MemoryManager appears as a concrete code block) 
1
src/prompts/dream-agent.ts [SPEC]
src/db/schema-phase3.sql [CODE] 
1
src/db/migrate-phase3.ts [SPEC] 
1
Phase 3 “NEW FILES IN PHASE 3” block is explicit. 
1

Phase 4 (Knowledge graph / GraphRAG)
New file list (explicit)

src/graph/graph-db.ts [SPEC]
src/graph/neo4j-adapter.ts [SPEC]
src/graph/kuzu-adapter.ts [SPEC]
src/graph/entity-extractor.ts [SPEC]
src/graph/relationship-extractor.ts [SPEC]
src/graph/graph-builder.ts [SPEC]
src/graph/graph-query.ts [SPEC]
src/graph/graph-grounding.ts [SPEC]
src/graph/entity-linker.ts [SPEC]
src/graph/graph-health.ts [SPEC]
src/graph/seed-parser.ts [SPEC]
src/graph/graph-export.ts [SPEC]
src/prompts/entity-extraction.ts [SPEC]
src/prompts/relationship-extraction.ts [SPEC]
src/db/schema-phase4.sql [CODE] (explicitly begins in doc as “FILE 1: schema-phase4.sql”) 
1
src/db/migrate-phase4.ts [SPEC]
web/components/GraphVisualization.tsx [SPEC]
Phase 4 “NEW FILES IN PHASE 4” block is explicit. 
1

Phase 5 (Hierarchy + daemon + approvals + scheduler + GitHub integration)
DB + migration

src/db/schema-phase5.sql [CODE] 
1
src/db/migrate-phase5.ts [CODE] 
1
GitHub integration

src/integrations/github.ts [CODE] 
1
src/integrations/pr-writer.ts [CODE] 
1
Daemon

src/runtime/daemon.ts [SPEC] (explicitly referenced by package.json scripts) 
1
Phase 5.1 (Operational hardening)
DB + migration

src/db/schema-phase5_1.sql [CODE] (shown inline as a large DDL block) 
1
src/db/migrate-phase5_1.ts [CODE] 
1
Hardening runtime modules referenced by later patches These are referenced (and imported) by other code blocks such as ToolRunner and Phase 6.1 hardening patches, even if the full file content isn’t shown in one place:

src/runtime/budget-manager.ts [SPEC] (imported by ToolRunner) 
1
src/runtime/incident-log.ts [SPEC] (imported by ToolRunner) 
1
Phase 6 (Tools + traces + evidence packs + replay)
DB + migration

src/db/schema-phase6.sql [CODE] 
1
src/db/migrate-phase6.ts [CODE] 
1
Tools runtime (explicit code blocks exist)

src/tools/tool-runner.ts [CODE] 
1
src/tools/evidence-pack.ts [CODE] 
1
Tools scaffolding paths explicitly referenced by “how to add a tool”

src/tools/manifests/my-tool.ts [SPEC] (example template path) 
1
src/tools/bootstrap.ts [SPEC] (example template path) 
1
src/tools/tool-policy.ts [SPEC] (example template path) 
1
src/integrations/connectors/my-connector.ts [SPEC] (example template path) 
1
tests/my-tool.test.ts [SPEC] (example template path) 
1
artifacts/tools/outputs/ [RUNTIME] (ToolRunner writes JSON outputs here) 
1
Phase 6.1 (Policy + provenance + signing + redaction + security audit)
DB

src/db/schema-phase6_1.sql [CODE] 
1
src/db/migrate-phase6_1.ts [SPEC] (invoked by CI migrations list; content not shown in the excerpts we opened, but path is required) 
1
Signed artifacts + immutability

src/runtime/artifact-signing.ts [CODE] 
1
src/runtime/immutable-artifacts.ts [CODE] 
1
Security audit

src/runtime/security-audit.ts [CODE] 
1
artifacts/security/audits/ [RUNTIME] 
1
Policy/provenance wiring (patch targets) The doc explicitly instructs patching these files (so they must exist even if stubbed initially):

src/tools/tool-runner.ts [CODE + PATCH] (Phase 6 file plus Phase 6.1 hardening patch instructions) 
1
src/runtime/agent-runner.ts [PATCH] 
1
src/runtime/orchestrator.ts [PATCH] 
1
src/runtime/policy-engine.ts [SPEC] (explicitly referenced in CODEOWNERS + patches) 
1
src/runtime/action-ledger.ts [SPEC] (patch references ActionLedger) 
1
src/runtime/approval-gate.ts [SPEC] (ReleaseGate imports it) 
1
src/runtime/redaction.ts [SPEC] (CODEOWNERS + patches) 
1
src/runtime/safety-review.ts [SPEC] (CODEOWNERS + patches) 
1
src/runtime/run-manifest.ts [SPEC] (orchestrator patch) 
1
src/runtime/provenance.ts [SPEC] (orchestrator patch) 
1
src/runtime/policy-auditor.ts [SPEC] (orchestrator patch) 
1
Web UI additions (explicit)

web/app/security/page.tsx [SPEC] 
1
web/app/provenance/page.tsx [SPEC] 
1
web/app/ledger/page.tsx [SPEC] 
1
web/app/layout.tsx [PATCH] (nav patch shown) 
1
Phase 7 (Benchmark lab + regression evals)
DB

src/db/schema-phase7.sql [CODE] 
1
src/db/migrate-phase7.ts [SPEC] (invoked by CI migrations list; must exist) 
1
Evals runtime

src/evals/suite-loader.ts [CODE] 
1
src/evals/gold-evaluator.ts [CODE] 
1
src/evals/benchmark-ci.ts [SPEC] (explicitly invoked by CI and composite action) 
1
src/evals/metrics.ts [SPEC] (imported by GoldEvaluator) 
1
Prompts referenced by evals

src/prompts/gold-comparator.ts [SPEC] (imported by GoldEvaluator) 
1
Benchmark suite files (explicit example)

benchmarks/suites/core/planning-basic/case.json [CODE] 
1
benchmarks/suites/core/planning-basic/gold.md [CODE] 
1
benchmarks/suites/<suite>/<case>/org.md [SPEC] (suite-loader reads it) 
1
benchmarks/suites/<suite>/<case>/constitution.md [SPEC] 
1
benchmarks/outputs/ci-summary.json [RUNTIME] (referenced in CI PR comment logic) 
1
Phase 8 (Portfolio orchestration)
Migration paths required by CI

src/db/migrate-phase8.ts [SPEC] (explicitly invoked by run-migrations composite action) 
1
src/db/schema-phase8.sql [SPEC] (not shown in the portions we opened; but migration will need it)
Portfolio runtime

src/portfolio/failure-containment.ts [CODE] 
1
src/portfolio/judge-council.ts [CODE] 
1
src/portfolio/best-of-n.ts [CODE] 
1
Prompts referenced by portfolio

src/prompts/judge-council.ts (or .js in imports) [SPEC] 
1
src/prompts/best-of-n-synthesizer.ts (import shows .js) [SPEC] 
1
Artifacts written

artifacts/portfolio/syntheses/<id>.md [RUNTIME] 
1
Phase 9 (Platformization)
Migration paths required by CI

src/db/migrate-phase9.ts [SPEC] (explicitly invoked by run-migrations composite action) 
1
src/db/schema-phase9.sql [SPEC] (not found as a concrete schema block in the snippets we opened; but CI expects migration runner to exist)
Platform runtime (explicit code blocks exist)

src/platform/observability.ts [CODE] 
1
src/api/admin-routes.ts [CODE] 
1
Platform modules imported by admin-routes

src/platform/backup-manager.ts [SPEC] (imported; not shown as full file in the excerpt) 
1
src/platform/tenant-context.ts [SPEC] 
1
Phase 10 (Learning organization)
DB + migration

src/db/schema-phase10.sql [CODE] 
1
src/db/migrate-phase10.ts [CODE] 
1
Prompts

src/prompts/improvement-proposer.ts [CODE] 
1
src/prompts/rollout-simulator.ts [SPEC] (imported by ReleaseGate) 
1
Learning runtime

src/learning/release-gate.ts [CODE] 
1
src/learning/learning-orchestrator.ts [SPEC] (referenced by package.json “learn” script) 
1
src/learning/drift-detector.ts [SPEC] (explicitly invoked in “run local drift check” snippet) 
1
src/learning/proposal-manager.ts [SPEC] (imported by ReleaseGate) 
1
src/learning/version-manager.ts [SPEC] (imported by ReleaseGate) 
1
Cross-cutting: CI/CD + scripts + hooks + CODEOWNERS (explicit “FILES CREATED” list)
Workflows

.github/workflows/ci.yml [CODE] 
1
.github/workflows/cd.yml [SPEC]
.github/workflows/benchmarks-nightly.yml [SPEC]
.github/workflows/learning-weekly.yml [SPEC]
.github/workflows/security-audit.yml [SPEC]
.github/workflows/distillation-monthly.yml [SPEC]
.github/workflows/dependency-review.yml [SPEC] (They are listed under “FILES CREATED”; not all are shown inline in the excerpt.) 
1
Composite actions

.github/actions/setup-autoorg/action.yml [CODE] 
1
.github/actions/run-migrations/action.yml [CODE] (migrations list is shown inline) 
1
.github/actions/benchmark-gate/action.yml [CODE] 
1
.github/actions/health-check/action.yml [CODE] 
1
Repo governance

.github/CODEOWNERS [CODE] 
1
CI scripts

scripts/ci/lint.ts [SPEC]
scripts/ci/typecheck.ts [SPEC]
scripts/ci/test-unit.ts [SPEC]
scripts/ci/migrate-all.ts [SPEC]
scripts/ci/smoke-test.ts [SPEC]
scripts/ci/health-check.ts [SPEC]
scripts/ci/security-scan.ts [SPEC]
scripts/ci/approval-health.ts [SPEC]
scripts/ci/rollback.ts [SPEC] (These are explicitly listed as “FILES CREATED”.) 
1
Deploy scripts

scripts/deploy/deploy-local.ts [SPEC]
scripts/deploy/deploy-single-node.ts [CODE] 
1
scripts/deploy/deploy-managed.ts [CODE] 
1
Git hooks

scripts/hooks/pre-commit [SPEC]
scripts/hooks/pre-push [SPEC]
scripts/hooks/commit-msg [SPEC] (Listed under “FILES CREATED”.) 
1
Cross-cutting: Web graph drilldown (explicit additional page)
web/app/graph/[nodeId]/page.tsx [CODE] 
1
Cross-cutting: DB migration runners required by CI (even if you stub)
From the run-migrations composite action, these paths must exist:

src/db/migrate.ts [SPEC]
src/db/migrate-phase5.ts [CODE] 
1
src/db/migrate-phase5_1.ts [CODE] 
1
src/db/migrate-phase6.ts [CODE] 
1
src/db/migrate-phase6_1.ts [SPEC] 
1
src/db/migrate-phase7.ts [SPEC] 
1
src/db/migrate-phase8.ts [SPEC] 
1
src/db/migrate-phase9.ts [SPEC] 
1
src/db/migrate-phase10.ts [CODE] 
1
Runtime-created / runtime-mutated paths (important for end-to-end correctness)
These aren’t “repo source files” but they’re explicitly written/read by code paths in the doc:

autoorg.db [RUNTIME] (SQLite DB file; also autoorg.db-wal, autoorg.db-shm) 
1
workspace/proposals/cycle_<N>.md [RUNTIME] (proposal drafts) 
1
memory/transcripts/cycle_<N>.jsonl [RUNTIME] 
1
artifacts/tools/outputs/<tx_...>.json [RUNTIME] 
1
artifacts/evidence/packs/<ep_...>.md [RUNTIME] 
1
artifacts/evidence/merged/<ep_...>.md [RUNTIME] 
1
artifacts/security/audits/<runId>.audit.json [RUNTIME] 
1
artifacts/security/audits/<runId>.audit.md [RUNTIME] 
1
benchmarks/outputs/ [RUNTIME] (CI uploads; includes ci-summary.json)



JSON checklist below is extracted from the current Autoorg.md by reading the explicit directory trees (“PART 1”), “NEW FILES IN PHASE …” blocks, “DIRECTORY ADDITIONS” blocks, “FILES CREATED” (CI/CD), and the many inline file headers where code is provided (e.g., src/tools/tool-runner.ts, src/db/schema-phase6.sql, etc.). 
1

It’s agent-consumable (valid JSON). Tags mean:

CODE: Autoorg.md includes code for this file (at least a concrete block under that path header).
PATCH: Autoorg.md gives patch instructions/snippets targeting this file (but not necessarily the whole file).
SPEC: file path is named/required by spec (tree/new-files/CI), but code is not shown in a dedicated block (or is partial/duplicated).
RUNTIME: not a source file; created/updated by runtime.
JSON

{
  "meta": {
    "source": "Autoorg.md (knarayanareddy/Autoorg main)",
    "raw_total_lines": 1253,
    "tag_legend": {
      "CODE": "Autoorg.md includes a code block under this file header/path",
      "PATCH": "Autoorg.md contains patch instructions that target this file",
      "SPEC": "Autoorg.md references the file path (tree/new-files/CI), but full code not provided as a dedicated block",
      "RUNTIME": "Artifact created/updated by the running system"
    },
    "coverage_note": "This list is built from explicit trees/lists and file headers. For a guaranteed 100% set of paths, also run a regex extractor across Autoorg.md in your repo."
  },

  "baseline_repo_structure": {
    "root_contract": [
      { "path": "Autoorg.md", "tag": "CODE" },
      { "path": "org.md", "tag": "SPEC" },
      { "path": "constitution.md", "tag": "SPEC" },
      { "path": "results.tsv", "tag": "SPEC" }
    ],
    "roles": [
      { "path": "roles/CEO.md", "tag": "CODE" },
      { "path": "roles/Engineer.md", "tag": "CODE" },
      { "path": "roles/Critic.md", "tag": "CODE" },
      { "path": "roles/Archivist.md", "tag": "CODE" },
      { "path": "roles/DevilsAdvocate.md", "tag": "CODE" },
      { "path": "roles/RatchetJudge.md", "tag": "CODE" },
      { "path": "roles/DreamAgent.md", "tag": "CODE" },
      { "path": "roles/CoordinatorLead.md", "tag": "SPEC" }
    ],
    "mailbox_ipc": [
      { "path": "mailbox/outbox/", "tag": "SPEC" },
      { "path": "mailbox/outbox/ceo_to_engineer.json", "tag": "SPEC" },
      { "path": "mailbox/outbox/ceo_to_critic.json", "tag": "SPEC" },
      { "path": "mailbox/inbox/", "tag": "SPEC" },
      { "path": "mailbox/inbox/engineer_reply.json", "tag": "SPEC" },
      { "path": "mailbox/inbox/critic_reply.json", "tag": "SPEC" }
    ],
    "memory": [
      { "path": "memory/MEMORY.md", "tag": "SPEC" },
      { "path": "memory/facts/domain_knowledge.md", "tag": "SPEC" },
      { "path": "memory/facts/failed_experiments.md", "tag": "SPEC" },
      { "path": "memory/facts/validated_decisions.md", "tag": "SPEC" },
      { "path": "memory/transcripts/", "tag": "SPEC" }
    ],
    "knowledge_graph": [
      { "path": "knowledge-graph/entities.json", "tag": "SPEC" },
      { "path": "knowledge-graph/relationships.json", "tag": "SPEC" },
      { "path": "knowledge-graph/graph.db", "tag": "SPEC" }
    ],
    "workspace": [
      { "path": "workspace/current_output.md", "tag": "SPEC" },
      { "path": "workspace/proposals/", "tag": "SPEC" },
      { "path": "workspace/snapshots/", "tag": "SPEC" }
    ],
    "conceptual_modules_from_tree": [
      { "path": "runtime/orchestrator.ts", "tag": "SPEC" },
      { "path": "runtime/agent-runner.ts", "tag": "SPEC" },
      { "path": "runtime/ratchet.ts", "tag": "SPEC" },
      { "path": "runtime/mailman.ts", "tag": "SPEC" },
      { "path": "runtime/dream.ts", "tag": "SPEC" },
      { "path": "runtime/graph-builder.ts", "tag": "SPEC" },
      { "path": "runtime/scorer.ts", "tag": "SPEC" },
      { "path": "adapters/base-adapter.ts", "tag": "SPEC" },
      { "path": "adapters/ollama.ts", "tag": "SPEC" },
      { "path": "adapters/anthropic.ts", "tag": "SPEC" },
      { "path": "adapters/openai.ts", "tag": "SPEC" },
      { "path": "adapters/gemini.ts", "tag": "SPEC" },
      { "path": "ui/terminal/Dashboard.tsx", "tag": "SPEC" },
      { "path": "ui/terminal/AgentPanel.tsx", "tag": "SPEC" },
      { "path": "ui/terminal/RatchetDisplay.tsx", "tag": "SPEC" },
      { "path": "ui/terminal/MemoryViewer.tsx", "tag": "SPEC" },
      { "path": "ui/web/OrgGraph.tsx", "tag": "SPEC" },
      { "path": "ui/web/CycleHistory.tsx", "tag": "SPEC" },
      { "path": "ui/web/AgentInterviewer.tsx", "tag": "SPEC" },
      { "path": "config/autoorg.config.ts", "tag": "SPEC" },
      { "path": "config/feature-flags.ts", "tag": "SPEC" },
      { "path": "tests/ratchet.test.ts", "tag": "SPEC" },
      { "path": "tests/mailbox.test.ts", "tag": "SPEC" },
      { "path": "tests/scorer.test.ts", "tag": "SPEC" }
    ]
  },

  "phases": {
    "phase0_core_mvp": [
      { "path": "package.json", "tag": "SPEC" },
      { "path": "tsconfig.json", "tag": "SPEC" },
      { "path": "bunfig.toml", "tag": "SPEC" },
      { "path": ".env.example", "tag": "SPEC" },
      { "path": ".gitignore", "tag": "SPEC" },

      { "path": "src/db/schema.sql", "tag": "CODE" },
      { "path": "src/db/migrate.ts", "tag": "SPEC" },

      { "path": "src/utils/git.ts", "tag": "CODE" },
      { "path": "src/utils/results-logger.ts", "tag": "CODE" },

      { "path": "src/runtime/orchestrator.ts", "tag": "SPEC" },
      { "path": "src/runtime/ratchet.ts", "tag": "CODE" },

      { "path": "src/scripts/init.ts", "tag": "CODE" },
      { "path": "src/scripts/verify.ts", "tag": "SPEC" },

      { "path": "src/index.ts", "tag": "SPEC" },
      { "path": "src/types/index.ts", "tag": "SPEC" }
    ],

    "phase1_real_agents": [
      {
        "path": "src/prompts/base.ts",
        "tag": "SPEC"
      },
      { "path": "src/prompts/ceo.ts", "tag": "SPEC" },
      { "path": "src/prompts/engineer.ts", "tag": "SPEC" },
      { "path": "src/prompts/critic.ts", "tag": "SPEC" },
      { "path": "src/prompts/devils-advocate.ts", "tag": "SPEC" },
      { "path": "src/prompts/archivist.ts", "tag": "SPEC" },
      { "path": "src/prompts/ratchet-judge.ts", "tag": "SPEC" },

      { "path": "src/runtime/agent-runner.ts", "tag": "SPEC" },
      { "path": "src/runtime/mailman.ts", "tag": "SPEC" },
      { "path": "src/runtime/transcript-logger.ts", "tag": "SPEC" },
      { "path": "src/utils/structured-output.ts", "tag": "CODE" },
      { "path": "src/utils/retry.ts", "tag": "CODE" },
      { "path": "src/utils/token-counter.ts", "tag": "SPEC" },

      { "path": "src/adapters/base-adapter.ts", "tag": "CODE" },
      { "path": "src/adapters/anthropic-adapter.ts", "tag": "CODE" },
      { "path": "src/adapters/openai-adapter.ts", "tag": "CODE" },
      { "path": "src/adapters/openai-compatible-adapter.ts", "tag": "CODE" },
      { "path": "src/adapters/ollama-adapter.ts", "tag": "CODE" },
      { "path": "src/adapters/adapter-factory.ts", "tag": "CODE" },

      { "path": "src/config/model-costs.ts", "tag": "SPEC" },
      { "path": "src/config/feature-flags.ts", "tag": "SPEC" }
    ],

    "phase2_org_pipeline_and_dashboard": [
      { "path": "src/runtime/objection-tracker.ts", "tag": "SPEC" },
      { "path": "src/runtime/cycle-context-builder.ts", "tag": "SPEC" },
      { "path": "src/runtime/pipeline.ts", "tag": "SPEC" },
      { "path": "src/runtime/interview.ts", "tag": "SPEC" },
      { "path": "src/runtime/event-bus.ts", "tag": "SPEC" },
      { "path": "src/db/queries.ts", "tag": "CODE" },
      { "path": "src/api/server.ts", "tag": "SPEC" },

      { "path": "web/package.json", "tag": "CODE" },
      { "path": "web/next.config.ts", "tag": "CODE" },
      { "path": "web/tailwind.config.ts", "tag": "CODE" },
      { "path": "web/app/layout.tsx", "tag": "CODE" },
      { "path": "web/app/globals.css", "tag": "CODE" },
      { "path": "web/app/page.tsx", "tag": "CODE" },

      { "path": "web/app/graph/[nodeId]/page.tsx", "tag": "CODE" },

      { "path": "web/components/ScoreChart.tsx", "tag": "SPEC" },
      { "path": "web/components/AgentGraph.tsx", "tag": "SPEC" },
      { "path": "web/components/CycleTimeline.tsx", "tag": "SPEC" },
      { "path": "web/components/ObjectionTracker.tsx", "tag": "SPEC" },
      { "path": "web/components/MailboxFeed.tsx", "tag": "SPEC" },
      { "path": "web/components/CostBreakdown.tsx", "tag": "SPEC" }
    ],

    "phase3_memory_and_dream": [
      { "path": "src/memory/embeddings.ts", "tag": "SPEC" },
      { "path": "src/memory/bm25.ts", "tag": "SPEC" },
      { "path": "src/memory/hybrid-search.ts", "tag": "SPEC" },
      { "path": "src/memory/fact-store.ts", "tag": "SPEC" },
      { "path": "src/memory/memory-health.ts", "tag": "SPEC" },

      { "path": "src/runtime/dream.ts", "tag": "SPEC" },
      { "path": "src/runtime/memory-manager.ts", "tag": "CODE" },
      { "path": "src/prompts/dream-agent.ts", "tag": "SPEC" },

      { "path": "src/db/schema-phase3.sql", "tag": "CODE" },
      { "path": "src/db/migrate-phase3.ts", "tag": "SPEC" }
    ],

    "phase4_graph_rag": [
      { "path": "src/graph/graph-db.ts", "tag": "SPEC" },
      { "path": "src/graph/neo4j-adapter.ts", "tag": "SPEC" },
      { "path": "src/graph/kuzu-adapter.ts", "tag": "SPEC" },
      { "path": "src/graph/entity-extractor.ts", "tag": "SPEC" },
      { "path": "src/graph/relationship-extractor.ts", "tag": "SPEC" },
      { "path": "src/graph/graph-builder.ts", "tag": "SPEC" },
      { "path": "src/graph/graph-query.ts", "tag": "SPEC" },
      { "path": "src/graph/graph-grounding.ts", "tag": "SPEC" },
      { "path": "src/graph/entity-linker.ts", "tag": "SPEC" },
      { "path": "src/graph/graph-health.ts", "tag": "SPEC" },
      { "path": "src/graph/seed-parser.ts", "tag": "SPEC" },
      { "path": "src/graph/graph-export.ts", "tag": "SPEC" },

      { "path": "src/prompts/entity-extraction.ts", "tag": "SPEC" },
      { "path": "src/prompts/relationship-extraction.ts", "tag": "SPEC" },

      { "path": "src/db/schema-phase4.sql", "tag": "CODE" },
      { "path": "src/db/migrate-phase4.ts", "tag": "SPEC" },

      { "path": "web/components/GraphVisualization.tsx", "tag": "SPEC" }
    ],

    "phase4_1_deterministic_grounding": [
      { "path": "src/db/schema-phase4_1.sql", "tag": "SPEC" },
      { "path": "src/db/migrate-phase4_1.ts", "tag": "SPEC" }
    ],

    "phase5_hierarchy_daemon_approvals_github": [
      { "path": "src/db/schema-phase5.sql", "tag": "CODE" },
      { "path": "src/db/migrate-phase5.ts", "tag": "CODE" },

      { "path": "src/integrations/github.ts", "tag": "CODE" },
      { "path": "src/integrations/pr-writer.ts", "tag": "CODE" },

      { "path": "src/runtime/daemon.ts", "tag": "SPEC" },
      { "path": "src/runtime/approval-gate.ts", "tag": "CODE" },
      { "path": "src/runtime/scheduler.ts", "tag": "CODE" },
      { "path": "src/runtime/ultraplan.ts", "tag": "CODE" }
    ],

    "phase5_1_operational_hardening": [
      { "path": "src/db/schema-phase5_1.sql", "tag": "CODE" },
      { "path": "src/db/migrate-phase5_1.ts", "tag": "CODE" },

      { "path": "src/runtime/approval-enforcer.ts", "tag": "SPEC" },
      { "path": "src/runtime/workspace-lock.ts", "tag": "SPEC" },
      { "path": "src/runtime/recovery-journal.ts", "tag": "SPEC" },
      { "path": "src/runtime/crash-recover.ts", "tag": "SPEC" },
      { "path": "src/runtime/lease-manager.ts", "tag": "SPEC" },

      { "path": "src/runtime/job-executor.ts", "tag": "CODE" },
      { "path": "src/runtime/budget-manager.ts", "tag": "CODE" },
      { "path": "src/runtime/memory-partitions.ts", "tag": "SPEC" },
      { "path": "src/runtime/ultraplan-sla.ts", "tag": "SPEC" },
      { "path": "src/runtime/incident-log.ts", "tag": "CODE" },

      { "path": "src/prompts/issue-translator.ts", "tag": "SPEC" },
      { "path": "src/prompts/diff-summarizer.ts", "tag": "SPEC" },
      { "path": "src/prompts/recovery-analyst.ts", "tag": "SPEC" },

      { "path": "src/integrations/issue-translator.ts", "tag": "SPEC" },
      { "path": "src/integrations/diff-summarizer.ts", "tag": "SPEC" },

      { "path": "src/api/hardening-routes.ts", "tag": "SPEC" }
    ],

    "phase6_tools_and_evidence": [
      { "path": "src/db/schema-phase6.sql", "tag": "CODE" },
      { "path": "src/db/migrate-phase6.ts", "tag": "CODE" },

      { "path": "src/tools/tool-runner.ts", "tag": "CODE" },
      { "path": "src/tools/evidence-pack.ts", "tag": "CODE" },
      { "path": "src/tools/registry.ts", "tag": "SPEC" },
      { "path": "src/tools/tool-policy.ts", "tag": "SPEC" },
      { "path": "src/tools/bootstrap.ts", "tag": "SPEC" },
      { "path": "src/tools/manifests/my-tool.ts", "tag": "SPEC" }
    ],

    "phase6_1_policy_provenance_security": [
      { "path": "src/db/schema-phase6_1.sql", "tag": "CODE" },
      { "path": "src/db/migrate-phase6_1.ts", "tag": "CODE" },

      { "path": "src/runtime/policy-engine.ts", "tag": "SPEC" },
      { "path": "src/runtime/risk-engine.ts", "tag": "SPEC" },
      { "path": "src/runtime/action-ledger.ts", "tag": "CODE" },
      { "path": "src/runtime/provenance.ts", "tag": "SPEC" },
      { "path": "src/runtime/redaction.ts", "tag": "SPEC" },
      { "path": "src/runtime/safety-review.ts", "tag": "SPEC" },
      { "path": "src/runtime/policy-auditor.ts", "tag": "SPEC" },

      { "path": "src/runtime/artifact-signing.ts", "tag": "CODE" },
      { "path": "src/runtime/immutable-artifacts.ts", "tag": "CODE" },
      { "path": "src/runtime/security-audit.ts", "tag": "CODE" },

      { "path": "src/prompts/unsafe-action-detector.ts", "tag": "SPEC" },
      { "path": "src/prompts/provenance-linker.ts", "tag": "SPEC" },
      { "path": "src/prompts/policy-auditor.ts", "tag": "SPEC" },

      { "path": "src/api/security-routes.ts", "tag": "SPEC" },

      { "path": "src/runtime/scorer.ts", "tag": "PATCH" },
      { "path": "src/runtime/results-logger.ts", "tag": "PATCH" },

      { "path": "web/app/security/page.tsx", "tag": "SPEC" },
      { "path": "web/app/provenance/page.tsx", "tag": "SPEC" },
      { "path": "web/app/ledger/page.tsx", "tag": "SPEC" }
    ],

    "phase7_benchmark_lab": [
      { "path": "src/db/schema-phase7.sql", "tag": "CODE" },
      { "path": "src/db/migrate-phase7.ts", "tag": "SPEC" },

      { "path": "src/evals/metrics.ts", "tag": "CODE" },
      { "path": "src/evals/suite-loader.ts", "tag": "CODE" },
      { "path": "src/prompts/gold-comparator.ts", "tag": "CODE" },
      { "path": "src/evals/gold-evaluator.ts", "tag": "CODE" },
      { "path": "src/evals/benchmark-runner.ts", "tag": "CODE" },
      { "path": "src/evals/leaderboard.ts", "tag": "CODE" },
      { "path": "src/evals/judge-calibrator.ts", "tag": "CODE" },
      { "path": "src/evals/constitution-ab.ts", "tag": "CODE" },
      { "path": "src/evals/regression-detector.ts", "tag": "PATCH" },

      { "path": "benchmarks/suites/", "tag": "SPEC" },
      { "path": "benchmarks/outputs/", "tag": "SPEC" }
    ],

    "phase8_portfolio": [
      { "path": "src/portfolio/org-variant.ts", "tag": "SPEC" },
      { "path": "src/portfolio/portfolio-runner.ts", "tag": "SPEC" },
      { "path": "src/portfolio/allocator.ts", "tag": "SPEC" },
      { "path": "src/portfolio/judge-council.ts", "tag": "SPEC" },
      { "path": "src/portfolio/tournament.ts", "tag": "SPEC" },
      { "path": "src/portfolio/best-of-n.ts", "tag": "CODE" },
      { "path": "src/portfolio/quarantine.ts", "tag": "SPEC" },
      { "path": "src/portfolio/exchange-bus.ts", "tag": "SPEC" },
      { "path": "src/portfolio/branch-strategy.ts", "tag": "SPEC" },
      { "path": "src/portfolio/failure-containment.ts", "tag": "SPEC" },
      { "path": "src/portfolio/priors.ts", "tag": "SPEC" },

      { "path": "src/prompts/portfolio-allocator.ts", "tag": "SPEC" },
      { "path": "src/prompts/judge-council.ts", "tag": "SPEC" },
      { "path": "src/prompts/tournament-referee.ts", "tag": "SPEC" },
      { "path": "src/prompts/best-of-n-synthesizer.ts", "tag": "SPEC" },
      { "path": "src/prompts/quarantine-reviewer.ts", "tag": "SPEC" },

      { "path": "src/db/schema-phase8.sql", "tag": "SPEC" },
      { "path": "src/db/migrate-phase8.ts", "tag": "SPEC" },

      { "path": "src/api/portfolio-routes.ts", "tag": "SPEC" },

      { "path": "portfolio/variants/default.json", "tag": "SPEC" },
      { "path": "portfolio/variants/strict_grounding.json", "tag": "SPEC" },
      { "path": "portfolio/variants/hierarchy_fast.json", "tag": "SPEC" },
      { "path": "portfolio/variants/research_heavy.json", "tag": "SPEC" },
      { "path": "portfolio/variants/quality_heavy.json", "tag": "SPEC" }
    ],

    "phase9_platform": [
      { "path": "src/platform/auth.ts", "tag": "CODE" },
      { "path": "src/platform/rbac.ts", "tag": "CODE" },
      { "path": "src/platform/tenant-context.ts", "tag": "CODE" },
      { "path": "src/platform/workspace-provisioner.ts", "tag": "SPEC" },
      { "path": "src/platform/hosted-runner.ts", "tag": "SPEC" },
      { "path": "src/platform/remote-agent.ts", "tag": "SPEC" },
      { "path": "src/platform/quota-manager.ts", "tag": "SPEC" },
      { "path": "src/platform/billing.ts", "tag": "SPEC" },
      { "path": "src/platform/comments.ts", "tag": "SPEC" },
      { "path": "src/platform/template-registry.ts", "tag": "SPEC" },
      { "path": "src/platform/role-registry.ts", "tag": "SPEC" },
      { "path": "src/platform/backup-manager.ts", "tag": "CODE" },
      { "path": "src/platform/retention-manager.ts", "tag": "SPEC" },
      { "path": "src/platform/observability.ts", "tag": "CODE" },
      { "path": "src/platform/deployment-modes.ts", "tag": "SPEC" },
      { "path": "src/platform/sdk-tokens.ts", "tag": "SPEC" },

      { "path": "src/sdk/ts/client.ts", "tag": "CODE" },
      { "path": "src/sdk/ts/types.ts", "tag": "CODE" },
      { "path": "src/sdk/ts/index.ts", "tag": "CODE" },

      { "path": "src/prompts/template-curator.ts", "tag": "SPEC" },
      { "path": "src/prompts/comment-summarizer.ts", "tag": "SPEC" },
      { "path": "src/prompts/usage-analyzer.ts", "tag": "SPEC" },

      { "path": "src/db/schema-phase9.sql", "tag": "SPEC" },
      { "path": "src/db/migrate-phase9.ts", "tag": "SPEC" },

      { "path": "src/api/auth-routes.ts", "tag": "SPEC" },
      { "path": "src/api/workspace-routes.ts", "tag": "SPEC" },
      { "path": "src/api/billing-routes.ts", "tag": "SPEC" },
      { "path": "src/api/admin-routes.ts", "tag": "CODE" },
      { "path": "src/api/template-routes.ts", "tag": "SPEC" },
      { "path": "src/api/sdk-routes.ts", "tag": "SPEC" },

      { "path": "platform/templates/baseline.json", "tag": "SPEC" },
      { "path": "platform/templates/research_org.json", "tag": "SPEC" },
      { "path": "platform/templates/quality_org.json", "tag": "SPEC" },
      { "path": "platform/templates/portfolio_org.json", "tag": "SPEC" },
      { "path": "platform/roles/engineer.json", "tag": "SPEC" },
      { "path": "platform/roles/critic.json", "tag": "SPEC" },
      { "path": "platform/roles/archivist.json", "tag": "SPEC" },
      { "path": "platform/roles/coordinator.json", "tag": "SPEC" }
    ],

    "phase10_learning_org": [
      { "path": "src/db/schema-phase10.sql", "tag": "CODE" },
      { "path": "src/db/migrate-phase10.ts", "tag": "CODE" },

      { "path": "src/learning/version-manager.ts", "tag": "SPEC" },
      { "path": "src/learning/lineage.ts", "tag": "SPEC" },
      { "path": "src/learning/pattern-miner.ts", "tag": "SPEC" },
      { "path": "src/learning/proposal-manager.ts", "tag": "SPEC" },
      { "path": "src/learning/prompt-optimizer.ts", "tag": "SPEC" },
      { "path": "src/learning/policy-optimizer.ts", "tag": "SPEC" },
      { "path": "src/learning/role-evolver.ts", "tag": "SPEC" },
      { "path": "src/learning/memory-utility.ts", "tag": "CODE" },
      { "path": "src/learning/memory-pruner.ts", "tag": "CODE" },
      { "path": "src/learning/routing-optimizer.ts", "tag": "SPEC" },
      { "path": "src/learning/adapter-distiller.ts", "tag": "SPEC" },
      { "path": "src/learning/simulator.ts", "tag": "SPEC" },
      { "path": "src/learning/release-gate.ts", "tag": "CODE" },
      { "path": "src/learning/drift-detector.ts", "tag": "SPEC" },
      { "path": "src/learning/learning-orchestrator.ts", "tag": "SPEC" },

      { "path": "src/prompts/pattern-extractor.ts", "tag": "SPEC" },
      { "path": "src/prompts/improvement-proposer.ts", "tag": "CODE" },
      { "path": "src/prompts/prompt-optimizer.ts", "tag": "SPEC" },
      { "path": "src/prompts/policy-optimizer.ts", "tag": "SPEC" },
      { "path": "src/prompts/role-evolver.ts", "tag": "SPEC" },
      { "path": "src/prompts/memory-utility.ts", "tag": "SPEC" },
      { "path": "src/prompts/routing-optimizer.ts", "tag": "SPEC" },
      { "path": "src/prompts/rollout-simulator.ts", "tag": "SPEC" },
      { "path": "src/prompts/prompt-drift-auditor.ts", "tag": "SPEC" },

      { "path": "src/api/learning-routes.ts", "tag": "SPEC" }
    ],

    "additional_core_runtime_files_listed_as_present": [
      { "path": "src/runtime/orchestrator-entrypoint.ts", "tag": "CODE" },
      { "path": "src/runtime/memory-init.ts", "tag": "CODE" },
      { "path": "src/runtime/transcript.ts", "tag": "CODE" },
      { "path": "src/runtime/graph-manager.ts", "tag": "CODE" },
      { "path": "src/runtime/error-handler.ts", "tag": "CODE" }
    ]
  },

  "ci_cd": {
    "github_workflows": [
      { "path": ".github/workflows/ci.yml", "tag": "CODE" },
      { "path": ".github/workflows/cd.yml", "tag": "SPEC" },
      { "path": ".github/workflows/benchmarks-nightly.yml", "tag": "CODE" },
      { "path": ".github/workflows/learning-weekly.yml", "tag": "SPEC" },
      { "path": ".github/workflows/security-audit.yml", "tag": "SPEC" },
      { "path": ".github/workflows/distillation-monthly.yml", "tag": "SPEC" },
      { "path": ".github/workflows/dependency-review.yml", "tag": "SPEC" }
    ],
    "github_actions_composite": [
      { "path": ".github/actions/setup-autoorg/action.yml", "tag": "SPEC" },
      { "path": ".github/actions/run-migrations/action.yml", "tag": "SPEC" },
      { "path": ".github/actions/benchmark-gate/action.yml", "tag": "CODE" },
      { "path": ".github/actions/health-check/action.yml", "tag": "CODE" }
    ],
    "codeowners": [
      { "path": ".github/CODEOWNERS", "tag": "CODE" }
    ],
    "scripts_ci": [
      { "path": "scripts/ci/lint.ts", "tag": "CODE" },
      { "path": "scripts/ci/typecheck.ts", "tag": "CODE" },
      { "path": "scripts/ci/test-unit.ts", "tag": "CODE" },
      { "path": "scripts/ci/migrate-all.ts", "tag": "CODE" },
      { "path": "scripts/ci/smoke-test.ts", "tag": "CODE" },
      { "path": "scripts/ci/health-check.ts", "tag": "CODE" },
      { "path": "scripts/ci/security-scan.ts", "tag": "CODE" },
      { "path": "scripts/ci/approval-health.ts", "tag": "CODE" },
      { "path": "scripts/ci/rollback.ts", "tag": "CODE" }
    ],
    "scripts_deploy": [
      { "path": "scripts/deploy/deploy-local.ts", "tag": "SPEC" },
      { "path": "scripts/deploy/deploy-single-node.ts", "tag": "SPEC" },
      { "path": "scripts/deploy/deploy-managed.ts", "tag": "SPEC" }
    ],
    "git_hooks": [
      { "path": "scripts/hooks/pre-commit", "tag": "SPEC" },
      { "path": "scripts/hooks/pre-push", "tag": "SPEC" },
      { "path": "scripts/hooks/commit-msg", "tag": "SPEC" }
    ]
  },

  "runtime_generated": [
    { "path": "autoorg.db", "tag": "RUNTIME" },
    { "path": "autoorg.db-wal", "tag": "RUNTIME" },
    { "path": "autoorg.db-shm", "tag": "RUNTIME" },

    { "path": "memory/graph.json", "tag": "RUNTIME" },

    { "path": "workspace/proposals/cycle_<N>.md", "tag": "RUNTIME" },
    { "path": "memory/transcripts/cycle_<N>.jsonl", "tag": "RUNTIME" },

    { "path": "artifacts/tools/outputs/tx_<id>.json", "tag": "RUNTIME" },
    { "path": "artifacts/evidence/packs/ep_<id>.md", "tag": "RUNTIME" },
    { "path": "artifacts/evidence/merged/ep_<id>.md", "tag": "RUNTIME" },

    { "path": "artifacts/security/audits/<runId>.audit.json", "tag": "RUNTIME" },
    { "path": "artifacts/security/audits/<runId>.audit.md", "tag": "RUNTIME" },

    { "path": "benchmarks/outputs/ci-summary.json", "tag": "RUNTIME" },
    { "path": "benchmarks/outputs/runs/<attemptId>.output.md", "tag": "RUNTIME" },
    { "path": "benchmarks/outputs/runs/<attemptId>.report.json", "tag": "RUNTIME" },

    { "path": "artifacts/portfolio/syntheses/psyn_<id>.md", "tag": "RUNTIME" },
    { "path": "artifacts/backups/bkp_<id>.tar.gz", "tag": "RUNTIME" }
  ]
}





Here’s a repo-local script you can drop in as tools/extract-paths.ts. It will parse Autoorg.md, extract file paths + directory paths, group them, and output JSON + Markdown reports you can feed back into your implementing agent as its self-audit checklist.

tools/extract-paths.ts
TypeScript

#!/usr/bin/env bun
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

type Kind = "file" | "dir";

type ExtractedPath = {
  path: string;
  kind: Kind;
  ext: string | null;
  group: string; // prefix bucket like "src", "web", ".github", "scripts", ...
  placeholder: boolean; // contains <N>, ..., etc.
  source: "regex";
};

function stripPunctuation(s: string) {
  return s
    .trim()
    // trim common wrappers
    .replace(/^[`"'([{<]+/g, "")
    .replace(/[`"')\]}>]+$/g, "")
    // trim trailing punctuation
    .replace(/[.,;:]+$/g, "");
}

function isProbablyUrlToken(s: string) {
  return s.startsWith("http://") || s.startsWith("https://") || s.includes("raw.githubusercontent.com");
}

function normalizeSlashes(s: string) {
  return s.replace(/\\/g, "/");
}

function groupFor(p: string): string {
  if (p.startsWith(".github/")) return ".github";
  if (p.startsWith("src/")) return "src";
  if (p.startsWith("web/")) return "web";
  if (p.startsWith("scripts/")) return "scripts";
  if (p.startsWith("roles/")) return "roles";
  if (p.startsWith("mailbox/")) return "mailbox";
  if (p.startsWith("memory/")) return "memory";
  if (p.startsWith("workspace/")) return "workspace";
  if (p.startsWith("knowledge-graph/")) return "knowledge-graph";
  if (p.startsWith("benchmarks/")) return "benchmarks";
  if (p.startsWith("artifacts/")) return "artifacts";
  if (p.startsWith("portfolio/")) return "portfolio";
  if (p.startsWith("platform/")) return "platform";
  return p.split("/")[0] || "root";
}

function extFor(p: string): string | null {
  const base = p.split("/").pop() ?? p;
  const idx = base.lastIndexOf(".");
  if (idx < 0) return null;
  return base.slice(idx + 1).toLowerCase();
}

function isPlaceholder(p: string): boolean {
  return p.includes("<") || p.includes(">") || p.includes("...") || p.includes("{") || p.includes("}");
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function main() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) {
    const k = process.argv[i];
    const v = process.argv[i + 1];
    if (k && v && k.startsWith("--")) args.set(k, v);
  }

  const inPath = args.get("--in") ?? "Autoorg.md";
  const outDir = args.get("--outDir") ?? "artifacts/build";
  const outJson = args.get("--outJson") ?? path.join(outDir, "paths.json");
  const outMd = args.get("--outMd") ?? path.join(outDir, "paths.md");

  const raw = readFileSync(inPath, "utf-8");
  const text = normalizeSlashes(raw);

  // 1) File paths with extensions (includes dotfiles and nested paths)
  const fileExts = [
    "ts", "tsx", "js", "jsx", "sql",
    "yml", "yaml",
    "md", "json", "toml",
    "sh", "bash", "txt",
    "css"
  ].join("|");

  // Matches:
  // - src/db/schema.sql
  // - .github/workflows/ci.yml
  // - web/app/layout.tsx
  // - package.json
  // - .env.example
  const fileRe = new RegExp(
    String.raw`(?<![A-Za-z0-9_])(?:\.?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*\/)?[A-Za-z0-9_.-]+\.(?:${fileExts})(?![A-Za-z0-9_])`,
    "g"
  );

  // 2) Directory paths (explicit trailing slash)
  // Matches:
  // - mailbox/outbox/
  // - memory/transcripts/
  const dirRe = new RegExp(
    String.raw`(?<![A-Za-z0-9_])(?:\.?[A-Za-z0-9_-]+\/)+(?!\/)(?![A-Za-z0-9_.-])`,
    "g"
  );

  const rawFileHits = text.match(fileRe) ?? [];
  const rawDirHits = text.match(dirRe) ?? [];

  const fileHits = uniq(rawFileHits)
    .map(stripPunctuation)
    .filter(Boolean)
    .filter((p) => !isProbablyUrlToken(p));

  const dirHits = uniq(rawDirHits)
    .map(stripPunctuation)
    .filter(Boolean)
    .filter((p) => !isProbablyUrlToken(p));

  const entries: ExtractedPath[] = [];

  for (const p of fileHits) {
    entries.push({
      path: p,
      kind: "file",
      ext: extFor(p),
      group: groupFor(p),
      placeholder: isPlaceholder(p),
      source: "regex"
    });
  }

  for (const p of dirHits) {
    // avoid adding directories that are just the prefix of a file path (still okay, but noisy)
    entries.push({
      path: p.endsWith("/") ? p : `${p}/`,
      kind: "dir",
      ext: null,
      group: groupFor(p),
      placeholder: isPlaceholder(p),
      source: "regex"
    });
  }

  // Deduplicate by (kind,path)
  const key = (e: ExtractedPath) => `${e.kind}:${e.path}`;
  const dedup = Array.from(new Map(entries.map((e) => [key(e), e])).values())
    .sort((a, b) => a.path.localeCompare(b.path));

  const grouped: Record<string, ExtractedPath[]> = {};
  for (const e of dedup) {
    grouped[e.group] ??= [];
    grouped[e.group].push(e);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outJson, JSON.stringify({ inPath, count: dedup.length, grouped }, null, 2));

  // Markdown report
  let md = `# AutoOrg path extraction report\n\n`;
  md += `Input: \`${inPath}\`\n\n`;
  md += `Total extracted entries: **${dedup.length}**\n\n`;

  for (const [grp, list] of Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))) {
    md += `## ${grp} (${list.length})\n\n`;
    md += `| kind | path | ext | placeholder |\n|---|---|---|---|\n`;
    for (const e of list) {
      md += `| ${e.kind} | \`${e.path}\` | ${e.ext ?? ""} | ${e.placeholder ? "yes" : "no"} |\n`;
    }
    md += `\n`;
  }

  writeFileSync(outMd, md);
  console.log(`Wrote:\n- ${outJson}\n- ${outMd}`);
}

main();
How to run it
Bash

mkdir -p tools artifacts/build
bun tools/extract-paths.ts --in Autoorg.md --outDir artifacts/build
Outputs:

artifacts/build/paths.json (machine-readable grouped list)
artifacts/build/paths.md (human-readable table)
How your implementation agent should use it (the “required” part)
Run the extractor.
For each extracted entry:
If group is artifacts / workspace / memory/transcripts and the path looks runtime-generated, mark as RUNTIME and don’t create as source (but ensure directories exist).
If placeholder=true (e.g., cycle_<N>.jsonl), treat as template and create the containing directory only.
Otherwise: ensure the file exists in the repo after generation (implemented or stubbed).
Produce artifacts/build/coverage-report.json with:
present (exists)
missing
stubbed (exists but contains TODO + throws)
generated (runtime-only)
This gives you a provable “no missing paths” guarantee directly against the current doc text





handover-ready bundle you can drop into your repo so a coding agent can implement the project from Autoorg.md with a manifest gate, fail-fast rules, and mechanical completeness checks.

It contains:

AGENT_HANDOVER.md — the operating manual / rules of engagement
AGENT_BUILD_PROMPT.txt — paste into your coding agent
tools/extract-paths.ts — mechanical path extractor (required)
tools/extract-file-bodies.ts — optional but strongly recommended: splits inline “path Language …content…” blocks out of Autoorg.md into real files
tools/coverage-report.ts — compares extracted paths vs repo tree and outputs a coverage report (required for “sorted and ready”)
tools/README.md — quick usage
You can copy/paste each file content below.

1) AGENT_HANDOVER.md
Markdown

# AutoOrg Agent Handover (Implementation Runbook)

This repository is specified by `Autoorg.md`. That document mixes:
- conceptual architecture,
- phase roadmaps,
- inline file bodies,
- patch instructions,
- CI/CD workflows and scripts.

To make implementation reliable, this repo uses a **manifest gate**: the agent must mechanically extract referenced paths and file bodies from `Autoorg.md` before coding.

---

## What “done” means
“Done” means:
1) **No missing referenced paths**: every file path referenced in `Autoorg.md` exists (implemented or stubbed) OR is explicitly classified as runtime-generated.
2) **Phase 0 runs in mock mode** end-to-end and produces:
   - `results.tsv` rows,
   - git commits for improving cycles,
   - an `autoorg.db` with runs/cycles,
   - `workspace/proposals/*` and `workspace/current_output.md`.
3) **Migrations + CI scaffolding exist**: all migration scripts enumerated by CI / composite actions exist and run idempotently.
4) **All scripts referenced by workflows exist** (even if initially “minimal”).

---

## Non-negotiable invariants (must be preserved)
These are the system’s “laws” from `Autoorg.md`:
- `org.md` is the only human-edited control file.
- `constitution.md` is immutable (the agent must not modify it during runs).
- `results.tsv` is append-only.
- Ratchet logic: commit only when score improves; otherwise revert/reset.
- Orchestrator follows a resilient “never stop unless stop criteria” loop.

If the doc is internally inconsistent, implement compatibility bridges (see below).

---

## Compatibility bridges (required)
Because `Autoorg.md` is jumbled in places, implement these compatibility rules:

1) **Environment variables**
   - Prefer `AUTOORG_*` env names if present.
   - Fall back to legacy names (e.g. `ANTHROPIC_API_KEY`).
   - Implement a single helper `src/config/env.ts` (or similar) so the rule is centralized.

2) **Entry points**
   - Support running via `src/index.ts` as CLI entry.
   - If scripts reference `src/runtime/orchestrator.ts` directly, keep it working too.

3) **TypeScript imports**
   - Some sections may show imports ending in `.js` while using TypeScript.
   - Standardize on one approach and keep it consistent (recommended: extensionless imports in TS).

4) **Memory cap**
   - Enforce the cap that is explicitly mandated in templates/rules (if multiple caps appear, choose the strictest that appears repeatedly; document your decision in `artifacts/build/implementation-notes.md`).

5) **Phase definition mismatch**
   - If Phase names differ across sections (e.g., Phase 5 “UI polish” vs “daemon/approvals”), treat the sections containing concrete schemas and file lists as authoritative and document the merge.

---

## The manifest gate (required)
The agent must do this before writing any code:

1) Run the path extractor:
   ```bash
   bun tools/extract-paths.ts --in Autoorg.md --outDir artifacts/build
Run the coverage report:

Bash

bun tools/coverage-report.ts --paths artifacts/build/paths.json --root . --out artifacts/build/coverage-report.json
The agent must NOT proceed until:

missing_source_files.length === 0 OR each missing path is explicitly categorized as runtime-only or “not required by spec”.
The agent produces artifacts/build/implementation-plan.md listing:
build order,
which files are CODE vs SPEC vs PATCH,
which files will be stubbed and why.
File body extraction (recommended)
Autoorg.md sometimes includes file bodies inline using headers like:

FILE N: src/whatever.ts