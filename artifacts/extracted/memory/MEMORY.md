memory/facts/
memory/partitions/
memory/archive/
memory/external/
results.tsv
transcripts/

# AutoOrg tenant data
tenants/

# Benchmark outputs (keep suite definitions, not run outputs)
benchmarks/outputs/
!benchmarks/suites/
!benchmarks/templates/

# Signing secrets
*.pem
*.key

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/settings.json
.idea/
*.swp
*.swo

# Logs
*.log
npm-debug.log*

# Test artifacts
test-results/
coverage/
5. .env.example
Bash

# ═══════════════════════════════════════════════════════════
# AutoOrg — Environment Configuration
# Copy to .env and fill in your values.
# NEVER commit .env to version control.
# ═══════════════════════════════════════════════════════════

# ── LLM PROVIDERS ────────────────────────────────────────────
# Required: set at least one provider
DEFAULT_LLM_PROVIDER=anthropic

AUTOORG_API_KEY_ANTHROPIC=sk-ant-your-key-here
AUTOORG_API_KEY_OPENAI=sk-your-openai-key-here

# ── DATABASE ──────────────────────────────────────────────────
AUTOORG_DB_PATH=autoorg.db

# ── SIGNING + SECURITY ────────────────────────────────────────
# Change this to a random 64-char string in production
AUTOORG_SIGNING_SECRET=change-me-to-a-random-secret

# ── DEPLOYMENT ───────────────────────────────────────────────
AUTOORG_DEPLOYMENT_MODE=local
AUTOORG_INSTANCE_NAME=dev-local
AUTOORG_VERSION=dev

# ── APPROVALS (set to 1 for local dev to skip approval gates) ─
AUTOORG_SKIP_APPROVALS=0

# ── RUN CONTROL ──────────────────────────────────────────────
AUTOORG_MAX_CYCLES=20
AUTOORG_PLATEAU_CYCLES=5
DREAM_INTERVAL_CYCLES=8

# ── TOOL SYSTEM ──────────────────────────────────────────────
AUTOORG_TOOLS_ENABLED=1
TOOL_MAX_CALLS_PER_CYCLE=6
TOOL_MAX_OUTPUT_CHARS=12000
SANDBOX_ALLOWED_PREFIXES=bun test,bun run,node,python,pytest,tsc,eslint,prettier,git diff,git status
SANDBOX_DEFAULT_TIMEOUT_MS=20000

# ── CONNECTORS ───────────────────────────────────────────────
WEB_FETCH_ENABLED=1
GITHUB_SEARCH_ENABLED=0
LOCAL_DOCS_ROOT=memory

# ── GITHUB INTEGRATION ───────────────────────────────────────
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=
GITHUB_DEFAULT_REPO=

# ── EVIDENCE + REPLAY ────────────────────────────────────────
EVIDENCE_PACK_MAX_CHARS=20000
TOOL_TRACE_ARTIFACT_DIR=artifacts/tools
EVIDENCE_ARTIFACT_DIR=artifacts/evidence

# ── WORKSPACE LOCK + LEASE ───────────────────────────────────
WORKSPACE_LOCK_TTL_MS=90000
WORKER_LEASE_TTL_MS=45000
JOB_LEASE_TTL_MS=60000

# ── BUDGET DEFAULTS ──────────────────────────────────────────
DEFAULT_TEAM_USD_BUDGET=1.5
DEFAULT_TEAM_TOKEN_BUDGET=40000
DEFAULT_TEAM_TOOL_CALL_BUDGET=50
DEFAULT_TEAM_MINUTE_BUDGET=20

# ── ULTRAPLAN ────────────────────────────────────────────────
ULTRAPLAN_MAX_DURATION_MS=900000
ULTRAPLAN_CHECKPOINT_INTERVAL_MS=120000

# ── BENCHMARK LAB ────────────────────────────────────────────
BENCHMARK_SUITE=core
BENCHMARK_TEMPLATE=baseline
BENCHMARK_CONSTITUTION=default
BENCHMARK_SEED=42
BENCHMARK_FAIL_ON_REGRESSION=true

# ── REGRESSION THRESHOLDS ────────────────────────────────────
REGRESSION_SCORE_DROP=0.03
REGRESSION_GROUNDEDNESS_DROP=0.04
REGRESSION_POLICY_DROP=0.03
REGRESSION_COST_INCREASE=0.20
REGRESSION_LATENCY_INCREASE=0.25

# ── PORTFOLIO ────────────────────────────────────────────────
PORTFOLIO_DEFAULT_BUDGET_USD=8
PORTFOLIO_DEFAULT_ROUNDS=3
PORTFOLIO_TOP_K_SURVIVE=2
PORTFOLIO_MAX_VARIANTS=6
PORTFOLIO_ALLOW_CROSS_ORG_EXCHANGE=1
PORTFOLIO_WORKTREE_ROOT=artifacts/portfolio/runs

# ── PLATFORM / MULTI-TENANT ──────────────────────────────────
AUTOORG_DEFAULT_PLAN=team
AUTOORG_BASE_URL=http://localhost:3000
AUTOORG_SESSION_TTL_DAYS=30
AUTOORG_COOKIE_NAME=autoorg_session
AUTOORG_REQUIRE_EMAIL_VERIFICATION=0
AUTOORG_TENANT_ROOT=tenants

# ── BILLING ──────────────────────────────────────────────────
AUTOORG_RUN_BASE_COST_USD=0.01
AUTOORG_TOKEN_UNIT_COST_USD=0.000003
AUTOORG_TOOL_CALL_COST_USD=0.0005
AUTOORG_STORAGE_GB_COST_USD=0.10
AUTOORG_AGENT_MINUTE_COST_USD=0.01

# ── BACKUPS ──────────────────────────────────────────────────
AUTOORG_BACKUP_DIR=artifacts/backups
AUTOORG_EXPORT_DIR=artifacts/exports
AUTOORG_ENABLE_RETENTION=1

# ── REMOTE AGENTS ────────────────────────────────────────────
AUTOORG_AGENT_HEARTBEAT_MS=15000
AUTOORG_AGENT_LEASE_MS=60000
AUTOORG_HOSTED_POLL_MS=3000

# ── LEARNING LOOP ────────────────────────────────────────────
LEARNING_LOOP_INTERVAL_MS=43200000
LEARNING_DEFAULT_SUITE=core
LEARNING_MAX_PROPOSALS_PER_CYCLE=5
LEARNING_ENABLE_PROMPT_OPT=1
LEARNING_ENABLE_POLICY_OPT=1
LEARNING_ENABLE_ROLE_EVOLUTION=1
LEARNING_ENABLE_ROUTING_OPT=1
LEARNING_ENABLE_MEMORY_PRUNE=1
LEARNING_ENABLE_ADAPTER_DISTILL=1
LEARNING_SIMULATION_SUITE=core
LEARNING_MAX_ALLOWED_SCORE_DROP=0.01
LEARNING_MAX_ALLOWED_GROUNDEDNESS_DROP=0.02
LEARNING_MAX_ALLOWED_POLICY_DROP=0.02
LEARNING_DRIFT_BLOCK_THRESHOLD=0.60
LEARNING_DRIFT_WARN_THRESHOLD=0.35
LEARNING_MEMORY_UTILITY_THRESHOLD=0.18
LEARNING_MEMORY_ARCHIVE_DIR=memory/archive
LEARNING_DISTILL_MIN_SCORE=0.82
LEARNING_DISTILL_MIN_POLICY=0.97
LEARNING_DISTILL_MAX_ROWS=500

# ── DEBUG ─────────────────────────────────────────────────────
AUTOORG_DEBUG_LLM=0
AUTOORG_READONLY_MODE=0
AUTOORG_VERBOSE_CYCLES=0
6. src/types/index.ts
TypeScript

// ─────────────────────────────────────────────────────────────────────────────
// AutoOrg — Shared Type Definitions
// src/types/index.ts
// ─────────────────────────────────────────────────────────────────────────────

// ── LLM providers ─────────────────────────────────────────────────────────────

export type LLMProvider = 'anthropic' | 'openai';

export interface ModelConfig {
  provider: LLMProvider;
  model: string;
}

export interface ModelCost {
  inputPerMToken: number;
  outputPerMToken: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMResponse {
  content: string;
  usage?: LLMUsage;
  costUsd?: number;
  model?: string;
}

export interface LLMRunOptions {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMStructuredOptions<T> {
  model: string;
  messages: LLMMessage[];
  schema: import('zod').ZodType<T>;
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
}

// ── Adapter interface ──────────────────────────────────────────────────────────

export interface LLMAdapter {
  provider: LLMProvider;
  run(opts: LLMRunOptions): Promise<LLMResponse>;
  structured<T>(opts: LLMStructuredOptions<T>): Promise<T & { _usage?: LLMUsage; _costUsd?: number }>;
}

// ── Run types ─────────────────────────────────────────────────────────────────

export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type RunMode = 'normal' | 'benchmark' | 'portfolio' | 'daemon';

export interface Run {
  id: string;
  tenantId?: string | null;
  workspaceId?: string | null;
  status: RunStatus;
  mode: RunMode;
  missionSummary: string;
  constitutionVariant: string;
  templateVariant: string;
  modelMapJson: string;
  portfolioVariantId?: string | null;
  benchmarkCaseJson?: string | null;
  bestScore?: number | null;
  totalCycles?: number | null;
  totalCostUsd?: number | null;
  totalToolCalls?: number | null;
  stoppedReason?: string | null;
  errorText?: string | null;
  finalEvidencePackId?: string | null;
  createdAt: string;
  finishedAt?: string | null;
}

// ── Cycle types ───────────────────────────────────────────────────────────────

export type CycleStatus = 'running' | 'committed' | 'reverted' | 'failed';
export type RatchetDecision = 'COMMIT' | 'REVERT' | 'PENDING_APPROVAL';

// ── Ratchet types ─────────────────────────────────────────────────────────────

export interface RatchetScore {
  composite: number;
  groundedness: number;
  novelty: number;
  consistency: number;
  missionAlignment: number;
  policyCompliance?: number;
  justification: string;
  rawScores?: Record<string, number>;
}

export interface Proposal {
  content: string;
  role: string;
  cycleNumber: number;
  evidencePackId?: string;
  verificationReport?: unknown;
  provenanceReport?: unknown;
  policyReport?: unknown;
  toolStats?: { toolCalls: number };
}

// ── Constitution ──────────────────────────────────────────────────────────────

export interface Constitution {
  text: string;
  variant: string;
  scoringWeights?: {
    groundedness?: number;
    novelty?: number;
    consistency?: number;
    missionAlignment?: number;
  };
}

// ── Knowledge graph ───────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  label: string;
  type: 'concept' | 'entity' | 'claim' | 'constraint' | 'goal';
  weight: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  version: number;
}

// ── Agent types ───────────────────────────────────────────────────────────────

export type RoleName =
  | 'CEO'
  | 'Engineer'
  | 'Critic'
  | 'Archivist'
  | 'DevilsAdvocate'
  | 'RatchetJudge'
  | 'CoordinatorLead'
  | 'DreamAgent';

export interface AgentContext {
  runId: string;
  cycle: number;
  role: RoleName | string;
  teamId?: string;
  taskId?: string;
  model: string;
  provider?: LLMProvider;
  memoryContext?: string;
  graphContext?: string;
  workspaceContext?: string;
  evidencePackId?: string;
  roleManifest?: unknown;
}

export interface AgentOutput {
  content: string;
  evidencePackId?: string;
  toolExecutionIds?: string[];
  usage?: LLMUsage;
  costUsd?: number;
  skipped?: boolean;
  skipReason?: string;
}

// ── Tool types ────────────────────────────────────────────────────────────────

export type CapabilityClass = 'search' | 'read' | 'verify' | 'execute' | 'transform';

export interface ToolExecutionContext {
  runId: string;
  cycleNumber: number;
  role: string;
  teamId?: string;
  taskId?: string;
  cwd?: string;
}

export interface ToolSource {
  type: 'file_hit' | 'web_page' | 'github_issue' | 'github_pr' | 'stdout' | 'stderr' | 'json' | 'text';
  uri?: string;
  title?: string;
  excerpt?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolResult {
  summary: string;
  output: unknown;
  sources?: ToolSource[];
  costUsd?: number;
  deterministic?: boolean;
}

// ── Policy types ──────────────────────────────────────────────────────────────

export type ActionClass = 'READ' | 'PROPOSE' | 'PATCH' | 'EXECUTE' | 'PUBLISH';
export type RiskTier = 'low' | 'medium' | 'high' | 'critical';

export interface PolicyDecision {
  allowed: boolean;
  requireApproval: boolean;
  requireReversible: boolean;
  requireProvenance: boolean;
  requireSignature: boolean;
  riskTier: RiskTier;
  matchedRule?: string;
  reasons: string[];
}

export interface ActionIntent {
  runId: string;
  cycleNumber: number;
  role: string;
  teamId?: string;
  actionClass: ActionClass;
  targetKind: 'tool' | 'file' | 'git' | 'api' | 'output';
  targetRef: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

// ── Approval types ────────────────────────────────────────────────────────────

export type ApprovalType =
  | 'commit'
  | 'execute'
  | 'publish'
  | 'ultraplan'
  | 'self_improvement'
  | 'self_improvement_release';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ApprovalRequest {
  runId: string;
  cycleNumber: number;
  approvalType: ApprovalType;
  subject: string;
  requestedBy: string;
  summary: string;
  details: Record<string, unknown>;
}

// ── Team types ────────────────────────────────────────────────────────────────

export interface TeamConfig {
  name: string;
  runId: string;
}

export interface Team {
  teamId: string;
  name: string;
  runId: string;
}

// ── Workspace types ───────────────────────────────────────────────────────────

export interface WorkspaceConfig {
  id?: string;
  tenantId?: string;
  root: string;
  isolationMode?: 'directory' | 'git_worktree' | 'container';
}

// ── Run config (full) ─────────────────────────────────────────────────────────

export interface RunConfig {
  orgText: string;
  constitutionText: string;
  missionCategory?: string;
  maxCycles?: number;
  plateauCycles?: number;
  seed?: number;
  mode?: RunMode;
  workspaceRoot?: string;
  workspaceId?: string;
  tenantId?: string;
  portfolioVariantId?: string;
  modelMap?: Record<string, string>;
  models?: Partial<Record<string, string>>;
  constitutionVariant?: string;
  templateVariant?: string;
  maxBudgetUsd?: number;
  useHierarchy?: boolean;
  ultraplanMaxDurationMs?: number;
  ultraplanCheckpointIntervalMs?: number;
  graphSeedMaterial?: string[];
  benchmarkCase?: {
    caseName: string;
    category: string;
    difficulty: string;
  };
}

// ── Feature flags ─────────────────────────────────────────────────────────────

export type FeatureFlagName =
  | 'knowledgeGraph'
  | 'dreamAgent'
  | 'coordinatorHierarchy'
  | 'ultraplan'
  | 'strictApprovalBlocking'
  | 'daemonRecovery'
  | 'workerLeases'
  | 'workspaceLocks'
  | 'jobExecutions'
  | 'issueTranslation'
  | 'diffPatchSummary'
  | 'teamBudgets'
  | 'teamMemoryPartitions'
  | 'ultraplanSla'
  | 'incidentLog'
  | 'toolRegistry'
  | 'toolUse'
  | 'toolPolicies'
  | 'toolTraces'
  | 'evidencePacks'
  | 'sandboxExec'
  | 'externalConnectors'
  | 'toolAwareCritic'
  | 'toolAwareJudge'
  | 'replayableToolTraces'
  | 'policyEngine'
  | 'actionLedger'
  | 'provenanceChain'
  | 'artifactSigning'
  | 'redactionFilters'
  | 'riskTieredApprovals'
  | 'unsafeActionDetector'
  | 'policyAwareJudge'
  | 'securityAuditExport'
  | 'immutableArtifacts'
  | 'benchmarkLab'
  | 'goldEvaluator'
  | 'leaderboards'
  | 'constitutionAB'
  | 'regressionAlarms'
  | 'offlineReplayLab'
  | 'judgeCalibration'
  | 'templateBakeoffs'
  | 'benchmarkCI'
  | 'portfolioOrchestration'
  | 'portfolioAllocator'
  | 'judgeCouncil'
  | 'tournamentMode'
  | 'crossOrgQuarantine'
  | 'bestOfNSynthesis'
  | 'branchPerOrg'
  | 'failureContainment'
  | 'portfolioDashboard'
  | 'multiTenantAuth'
  | 'rbacPlatform'
  | 'hostedRuns'
  | 'remoteAgents'
  | 'templateMarketplace'
  | 'billingAndQuotas'
  | 'workspaceIsolation'
  | 'backupRestore'
  | 'complianceRetention'
  | 'adminObservability'
  | 'publicApiSdk'
  | 'learningLoop'
  | 'patternMining'
  | 'promptOptimization'
  | 'policyOptimization'
  | 'roleEvolution'
  | 'memoryUtilityPruning'
  | 'routingOptimization'
  | 'adapterDistillation'
  | 'simulateBeforeRollout'
  | 'selfImprovementApproval'
  | 'promptDriftGuard'
  | 'learningLineage';

// ── Results logger ────────────────────────────────────────────────────────────

export interface ResultsRow {
  cycle: number;
  score: number;
  groundedness: number;
  novelty: number;
  consistency: number;
  missionAlignment: number;
  policyCompliance: number;
  decision: string;
  summary: string;
  costUsd?: number;
}

// ── Transcript events ─────────────────────────────────────────────────────────

export type TranscriptEventType =
  | 'cycle_start'
  | 'cycle_end'
  | 'agent_output'
  | 'synthesis'
  | 'ratchet_score'
  | 'tool_call'
  | 'tool_result'
  | 'approval_requested'
  | 'approval_granted'
  | 'commit_pending'
  | 'commit_materialized';

export interface TranscriptEvent {
  type: TranscriptEventType;
  ts?: string;
  cycleNumber?: number;
  role?: string;
  content?: string;
  score?: RatchetScore | number;
  decision?: string;
  bestScore?: number;
  plateauCount?: number;
  [key: string]: unknown;
}
7. src/config/model-costs.ts
TypeScript

// src/config/model-costs.ts
// Cost per million tokens (USD) for each supported model.
// Update these as provider pricing changes.

import type { ModelCost } from '@/types/index.js';

export const MODEL_COSTS: Record<string, ModelCost> = {
  // Anthropic
  'claude-opus-4':           { inputPerMToken: 15.00,  outputPerMToken: 75.00  },
  'claude-sonnet-4-5':       { inputPerMToken: 3.00,   outputPerMToken: 15.00  },
  'claude-haiku-3-5':        { inputPerMToken: 0.80,   outputPerMToken: 4.00   },

  // OpenAI
  'gpt-4.1':                 { inputPerMToken: 2.00,   outputPerMToken: 8.00   },
  'gpt-4o':                  { inputPerMToken: 5.00,   outputPerMToken: 15.00  },
  'gpt-4o-mini':             { inputPerMToken: 0.15,   outputPerMToken: 0.60   },
  'o1':                      { inputPerMToken: 15.00,  outputPerMToken: 60.00  },
  'o3-mini':                 { inputPerMToken: 1.10,   outputPerMToken: 4.40   },

  // Fallback for unknown models
  'default':                 { inputPerMToken: 3.00,   outputPerMToken: 15.00  },
};

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[model] ?? MODEL_COSTS['default']!;
  return (
    (inputTokens / 1_000_000) * costs.inputPerMToken +
    (outputTokens / 1_000_000) * costs.outputPerMToken
  );
}
8. src/config/feature-flags.ts
TypeScript

// src/config/feature-flags.ts
import { getDb } from '@/db/migrate.js';
import type { FeatureFlagName } from '@/types/index.js';

// In-process cache — refreshed every 60 seconds
const cache = new Map<string, boolean>();
let cacheBuiltAt = 0;
const CACHE_TTL_MS = 60_000;

function buildCache(): void {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT flag_name, enabled FROM feature_flags`
    ).all() as Array<{ flag_name: string; enabled: number }>;
    db.close();

    cache.clear();
    for (const row of rows) {
      cache.set(row.flag_name, row.enabled === 1);
    }
    cacheBuiltAt = Date.now();
  } catch {
    // DB not ready — cache stays empty, all flags return false
  }
}

export function featureFlag(name: FeatureFlagName | string): boolean {
  // Env var override takes priority: FEATURE_TOOL_USE=1 or FEATURE_TOOL_USE=0
  const envKey = `FEATURE_${name
    .replace(/([A-Z])/g, '_$1')
    .toUpperCase()
    .replace(/^_/, '')}`;
  const envVal = process.env[envKey];
  if (envVal === '1' || envVal === 'true') return true;
  if (envVal === '0' || envVal === 'false') return false;

  // AUTOORG_SKIP_APPROVALS shortcut
  if (
    name === 'strictApprovalBlocking' &&
    process.env.AUTOORG_SKIP_APPROVALS === '1'
  ) {
    return false;
  }

  // Build/refresh cache
  if (Date.now() - cacheBuiltAt > CACHE_TTL_MS) {
    buildCache();
  }

  return cache.get(name) ?? false;
}

export function invalidateFlagCache(): void {
  cache.clear();
  cacheBuiltAt = 0;
}
9. src/db/migrate.ts
TypeScript

// src/db/migrate.ts
// Base migration + getDb() singleton

import Database from 'better-sqlite3';
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const DB_PATH = process.env.AUTOORG_DB_PATH ?? 'autoorg.db';

// Ensure parent directory exists
const dbDir = path.dirname(path.resolve(DB_PATH));
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

export function getDb(): Database.Database {
  const db = new Database(path.resolve(DB_PATH));

  // WAL mode for concurrent readers
  db.pragma('journal_mode = WAL');

  // Busy timeout — wait up to 5s when DB is locked
  db.pragma('busy_timeout = 5000');

  // Enforce foreign keys
  db.pragma('foreign_keys = ON');

  // Recommended for WAL mode
  db.pragma('synchronous = NORMAL');

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// BASE SCHEMA
// ─────────────────────────────────────────────────────────────────────────────

async function migrate() {
  const db = getDb();

  db.exec(`
    -- ──────────────────────────────────────────────────────────
    -- TABLE: feature_flags
    -- ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS feature_flags (
      flag_name TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );

    -- ──────────────────────────────────────────────────────────
    -- TABLE: runs
    -- ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      workspace_id TEXT,
      status TEXT NOT NULL DEFAULT 'running'
        CHECK(status IN ('running','completed','failed','cancelled')),
      mode TEXT NOT NULL DEFAULT 'normal',
      mission_summary TEXT NOT NULL DEFAULT '',
      constitution_variant TEXT NOT NULL DEFAULT 'default',
      template_variant TEXT NOT NULL DEFAULT 'baseline',
      model_map_json TEXT NOT NULL DEFAULT '{}',
      portfolio_variant_id TEXT,
      benchmark_case_json TEXT,
      best_score REAL,
      total_cycles INTEGER,
      total_cost_usd REAL,
      total_tool_calls INTEGER,
      stopped_reason TEXT,
      error_text TEXT,
      final_evidence_pack_id TEXT,
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      finished_at DATETIME
    );

    -- ──────────────────────────────────────────────────────────
    -- TABLE: cycles
    -- ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS cycles (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      cycle_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'running'
        CHECK(status IN ('running','committed','reverted','failed')),
      score REAL,
      decision TEXT,
      started_at DATETIME NOT NULL DEFAULT (datetime('now')),
      finished_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_cycles_run
      ON cycles(run_id, cycle_number);

    -- ──────────────────────────────────────────────────────────
    -- TABLE: approvals
    -- ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      cycle_number INTEGER NOT NULL,
      approval_type TEXT NOT NULL,
      subject TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','approved','rejected','expired')),
      summary TEXT NOT NULL DEFAULT '',
      details_json TEXT NOT NULL DEFAULT '{}',
      reviewed_by TEXT,
      review_comment TEXT,
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      reviewed_at DATETIME,
      expires_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_approvals_run_status
      ON approvals(run_id, status, created_at DESC);

    -- ──────────────────────────────────────────────────────────
    -- TABLE: delegated_tasks
    -- ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS delegated_tasks (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      cycle_number INTEGER NOT NULL,
      from_role TEXT NOT NULL,
      to_role TEXT NOT NULL,
      task_type TEXT NOT NULL CHECK(task_type IN ('research','quality','planning','memory')),
      instruction TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','running','completed','failed','cancelled')),
      result_summary TEXT,
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_delegated_tasks_run
      ON delegated_tasks(run_id, cycle_number, status);

    -- ──────────────────────────────────────────────────────────
    -- TABLE: scheduled_jobs
    -- ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id TEXT PRIMARY KEY,
      job_type TEXT NOT NULL CHECK(job_type IN ('org_run','dream','graph_rebuild','health_check','github_sync')),
      run_id TEXT,
      cron_expression TEXT,
      status TEXT NOT NULL DEFAULT 'idle'
        CHECK(status IN ('idle','running','error','disabled')),
      payload_json TEXT NOT NULL DEFAULT '{}',
      last_run_at DATETIME,
      last_error TEXT,
      created_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );

    -- ──────────────────────────────────────────────────────────
    -- TABLE: github_events
    -- ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS github_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      repo_full_name TEXT,
      processed INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_github_events_processed
      ON github_events(processed, event_type, created_at);

    -- ──────────────────────────────────────────────────────────
    -- TABLE: ultraplan_sessions
    -- ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS ultraplan_sessions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      cycle_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'running'
        CHECK(status IN ('running','completed','failed','timeout','cancelled')),
      result_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      finished_at DATETIME
    );

    -- ──────────────────────────────────────────────────────────
    -- TABLE: results_log
    -- ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS results_log (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      cycle_number INTEGER NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      groundedness REAL NOT NULL DEFAULT 0,
      novelty REAL NOT NULL DEFAULT 0,
      consistency REAL NOT NULL DEFAULT 0,
      mission_alignment REAL NOT NULL DEFAULT 0,
      policy_compliance REAL NOT NULL DEFAULT 1,
      decision TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      cost_usd REAL NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_results_log_run
      ON results_log(run_id, cycle_number);

    -- ──────────────────────────────────────────────────────────
    -- Seed base feature flags
    -- ──────────────────────────────────────────────────────────
    INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES
      ('knowledgeGraph', 1, 'Knowledge graph construction and retrieval'),
      ('dreamAgent', 1, 'Periodic memory consolidation via DreamAgent'),
      ('coordinatorHierarchy', 1, 'Multi-team coordinator hierarchy'),
      ('ultraplan', 1, 'Strategic ULTRAPLAN on plateau');
  `);

  db.close();
  console.log('✅ Base migration complete');
}

if (import.meta.main) {
  migrate().catch(console.error);
}
10. src/adapters/base-adapter.ts
TypeScript

// src/adapters/base-adapter.ts
import type { LLMAdapter, LLMMessage, LLMResponse, LLMRunOptions, LLMStructuredOptions } from '@/types/index.js';

export abstract class BaseAdapter implements LLMAdapter {
  abstract provider: import('@/types/index.js').LLMProvider;

  abstract run(opts: LLMRunOptions): Promise<LLMResponse>;

  async structured<T>(opts: LLMStructuredOptions<T>): Promise<T> {
    const maxRetries = opts.maxRetries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.run({
          model: opts.model,
          messages: [
            ...opts.messages,
            {
              role: 'user' as const,
              content: attempt === 1
                ? 'Respond with valid JSON matching the required schema. No markdown. No explanation.'
                : `Attempt ${attempt}. Previous response was not valid JSON. Respond ONLY with valid JSON.`,
            },
          ],
          temperature: opts.temperature ?? 0.1,
          maxTokens: opts.maxTokens ?? 4096,
        });

        const text = response.content.trim();

        // Strip markdown fences if present
        const jsonText = text
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        const parsed = JSON.parse(jsonText);
        const validated = opts.schema.parse(parsed);

        // Attach usage metadata to result
        return Object.assign(validated as object, {
          _usage: response.usage,
          _costUsd: response.costUsd,
        }) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500 * attempt));
        }
      }
    }

    throw new Error(`structured() failed after ${maxRetries} attempts: ${lastError?.message}`);
  }
}
11. src/adapters/anthropic-adapter.ts
TypeScript

// src/adapters/anthropic-adapter.ts
import Anthropic from '@anthropic-ai/sdk';
import { BaseAdapter } from '@/adapters/base-adapter.js';
import { estimateCost } from '@/config/model-costs.js';
import type { LLMProvider, LLMResponse, LLMRunOptions } from '@/types/index.js';

export class AnthropicAdapter extends BaseAdapter {
  provider: LLMProvider = 'anthropic';
  private client: Anthropic;

  constructor() {
    super();
    const apiKey = process.env.AUTOORG_API_KEY_ANTHROPIC;
    if (!apiKey) throw new Error('AUTOORG_API_KEY_ANTHROPIC is not set');
    this.client = new Anthropic({ apiKey });
  }

  async run(opts: LLMRunOptions): Promise<LLMResponse> {
    const systemMessage = opts.messages.find(m => m.role === 'system');
    const userMessages = opts.messages.filter(m => m.role !== 'system');

    const response = await this.client.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.2,
      system: systemMessage?.content,
      messages: userMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const content = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('');

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = estimateCost(opts.model, inputTokens, outputTokens);

    if (process.env.AUTOORG_DEBUG_LLM === '1') {
      console.debug(`[AnthropicAdapter] model=${opts.model} in=${inputTokens} out=${outputTokens} cost=$${costUsd.toFixed(6)}`);
    }

    return {
      content,
      usage: { inputTokens, outputTokens },
      costUsd,
      model: opts.model,
    };
  }
}
12. src/adapters/openai-adapter.ts
TypeScript

// src/adapters/openai-adapter.ts
import OpenAI from 'openai';
import { BaseAdapter } from '@/adapters/base-adapter.js';
import { estimateCost } from '@/config/model-costs.js';
import type { LLMProvider, LLMResponse, LLMRunOptions } from '@/types/index.js';

export class OpenAIAdapter extends BaseAdapter {
  provider: LLMProvider = 'openai';
  private client: OpenAI;

  constructor() {
    super();
    const apiKey = process.env.AUTOORG_API_KEY_OPENAI;
    if (!apiKey) throw new Error('AUTOORG_API_KEY_OPENAI is not set');
    this.client = new OpenAI({ apiKey });
  }

  async run(opts: LLMRunOptions): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.2,
      messages: opts.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });

    const content = response.choices[0]?.message?.content ?? '';
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    const costUsd = estimateCost(opts.model, inputTokens, outputTokens);

    if (process.env.AUTOORG_DEBUG_LLM === '1') {
      console.debug(`[OpenAIAdapter] model=${opts.model} in=${inputTokens} out=${outputTokens} cost=$${costUsd.toFixed(6)}`);
    }

    return {
      content,
      usage: { inputTokens, outputTokens },
      costUsd,
      model: opts.model,
    };
  }
}
13. src/adapters/adapter-factory.ts
TypeScript

// src/adapters/adapter-factory.ts
import { AnthropicAdapter } from '@/adapters/anthropic-adapter.js';
import { OpenAIAdapter } from '@/adapters/openai-adapter.js';
import type { LLMAdapter, LLMProvider, ModelConfig } from '@/types/index.js';

const adapters = new Map<LLMProvider, LLMAdapter>();

export function getAdapter(config: ModelConfig | { provider: LLMProvider; model?: string }): LLMAdapter {
  const provider = config.provider;

  if (!adapters.has(provider)) {
    switch (provider) {
      case 'anthropic':
        adapters.set('anthropic', new AnthropicAdapter());
        break;
      case 'openai':
        adapters.set('openai', new OpenAIAdapter());
        break;
      default:
        throw new Error(`Unknown LLM provider: ${provider}`);
    }
  }

  return adapters.get(provider)!;
}

export function getAdapterForModel(model: string): LLMAdapter {
  const isAnthropic = model.startsWith('claude');
  const isOpenAI = model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3');

  if (isAnthropic) return getAdapter({ provider: 'anthropic', model });
  if (isOpenAI) return getAdapter({ provider: 'openai', model });

  const defaultProvider = (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as LLMProvider;
  return getAdapter({ provider: defaultProvider, model });
}
14. src/runtime/agent-runner.ts
TypeScript

// src/runtime/agent-runner.ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { getAdapterForModel } from '@/adapters/adapter-factory.js';
import { featureFlag } from '@/config/feature-flags.js';
import { getDb } from '@/db/migrate.js';
import { ToolRunner } from '@/tools/tool-runner.js';
import { ToolPolicy } from '@/tools/tool-policy.js';
import { EvidencePackBuilder } from '@/tools/evidence-pack.js';
import { BudgetManager } from '@/runtime/budget-manager.js';
import { RedactionFilter } from '@/runtime/redaction.js';
import { ActionLedger } from '@/runtime/action-ledger.js';
import { PolicyEngine } from '@/runtime/policy-engine.js';
import { IncidentLog } from '@/runtime/incident-log.js';
import { TOOL_PLANNER_SYSTEM_PROMPT, ToolPlanSchema } from '@/prompts/tool-planner.js';
import { EVIDENCE_SYNTHESIZER_SYSTEM_PROMPT } from '@/prompts/evidence-synthesizer.js';
import type { AgentContext, AgentOutput, LLMMessage } from '@/types/index.js';

export class AgentRunner {
  static async runWithTools(opts: {
    runId: string;
    cycle: number;
    role: string;
    task: string;
    prompt: string;
    model: string;
    teamId?: string;
    taskId?: string;
    memoryContext?: string;
    graphContext?: string;
    workspaceContext?: string;
    evidencePackId?: string;
    roleManifest?: unknown;
    toolRegistry?: import('@/tools/registry.js').ToolRegistry;
  }): Promise<AgentOutput> {
    const adapter = getAdapterForModel(opts.model);
    const budgets = new BudgetManager(opts.runId);
    const redactor = new RedactionFilter(opts.runId);
    const ledger = new ActionLedger(opts.runId);
    const policyEngine = new PolicyEngine(opts.runId);
    const incidents = new IncidentLog();

    const teamId = opts.teamId ?? 'shared';

    // Budget check
    const estimatedTokens = Math.ceil(
      ((opts.prompt.length + (opts.workspaceContext?.length ?? 0) + (opts.memoryContext?.length ?? 0)) / 3.5)
    );

    if (featureFlag('teamBudgets') && opts.teamId) {
      if (!budgets.canSpend(teamId, 'tokens', estimatedTokens)) {
        incidents.log({
          runId: opts.runId,
          severity: 'warn',
          component: 'agent-runner',
          summary: `Token budget exceeded for ${opts.role} on team ${teamId}`,
          details: { estimatedTokens, cycle: opts.cycle },
        });
        return {
          content: '',
          skipped: true,
          skipReason: `Token budget exceeded for team ${teamId}`,
        };
      }
    }

    // Build effective prompt with learning overlays
    let effectiveSystemPrompt = opts.prompt;

    if (opts.roleManifest && typeof opts.roleManifest === 'object') {
      const manifest = opts.roleManifest as Record<string, unknown>;
      if (manifest['instructions']) {
        effectiveSystemPrompt = [
          effectiveSystemPrompt,
          '',
          '## ROLE EVOLUTION OVERLAY',
          JSON.stringify(manifest['instructions'], null, 2),
        ].join('\n');
      }
    }

    const executionIds: string[] = [];
    let evidencePackId: string | undefined = opts.evidencePackId;

    // Tool planning and execution
    if (
      featureFlag('toolUse') &&
      opts.toolRegistry &&
      featureFlag('toolPolicies')
    ) {
      const toolPolicies = new ToolPolicy(opts.runId);
      const availableTools = opts.toolRegistry.list()
        .filter(t => toolPolicies.isAllowed({ role: opts.role, toolName: t.name, teamId: opts.teamId }))
        .map(t => ({ name: t.name, class: t.capabilityClass, description: t.description }));

      if (availableTools.length > 0) {
        try {
          const plan = await adapter.structured({
            model: opts.model,
            messages: [
              { role: 'system', content: TOOL_PLANNER_SYSTEM_PROMPT },
              {
                role: 'user',
                content: JSON.stringify({
                  role: opts.role,
                  task: opts.task,
                  availableTools,
                  memoryContext: (opts.memoryContext ?? '').slice(0, 2000),
                  graphContext: (opts.graphContext ?? '').slice(0, 2000),
                  workspaceContext: (opts.workspaceContext ?? '').slice(0, 3000),
                }, null, 2),
              },
            ],
            schema: ToolPlanSchema,
          });

          if (plan.needs_tools && plan.tool_calls?.length > 0) {
            const toolRunner = new ToolRunner(opts.runId, opts.toolRegistry);

            for (const call of plan.tool_calls) {
              try {
                const result = await toolRunner.execute(call.tool_name, call.args, {
                  runId: opts.runId,
                  cycleNumber: opts.cycle,
                  role: opts.role,
                  teamId: opts.teamId,
                  taskId: opts.taskId,
                  cwd: process.cwd(),
                });
                executionIds.push(result.executionId);
              } catch (err) {
                incidents.log({
                  runId: opts.runId,
                  severity: 'warn',
                  component: 'agent-runner',
                  summary: `Tool ${call.tool_name} failed`,
                  details: { error: err instanceof Error ? err.message : String(err) },
                });
              }
            }

            if (executionIds.length > 0 && featureFlag('evidencePacks')) {
              const packs = new EvidencePackBuilder(opts.runId);
              const pack = await packs.fromExecutions({
                cycleNumber: opts.cycle,
                ownerRole: opts.role,
                teamId: opts.teamId,
                taskId: opts.taskId,
                kind: 'worker',
                executionIds,
                summary: `${opts.role} evidence pack for cycle ${opts.cycle}`,
              });
              evidencePackId = pack.packId;
            }
          }
        } catch (err) {
          incidents.log({
            runId: opts.runId,
            severity: 'warn',
            component: 'agent-runner',
            summary: `Tool planning failed for ${opts.role}`,
            details: { error: err instanceof Error ? err.message : String(err) },
          });
        }
      }
    }

    // Read evidence pack if available
    let evidenceText = '';
    if (evidencePackId) {
      evidenceText = await Bun.file(
        `artifacts/evidence/packs/${evidencePackId}.md`
      ).text().catch(() => '');
    }

    // Build full message context
    const userContent = [
      effectiveSystemPrompt,
      '',
      '## TASK',
      opts.task,
      '',
      '## MEMORY CONTEXT',
      (opts.memoryContext ?? '').slice(0, 3000),
      '',
      '## GRAPH CONTEXT',
      (opts.graphContext ?? '').slice(0, 2000),
      '',
      '## WORKSPACE CONTEXT',
      (opts.workspaceContext ?? '').slice(0, 6000),
      '',
      evidenceText ? '## EVIDENCE PACK' : '',
      evidenceText ? evidenceText.slice(0, 12000) : '',
    ].filter(Boolean).join('\n');

    const messages: LLMMessage[] = [
      { role: 'system', content: EVIDENCE_SYNTHESIZER_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ];

    // Record PROPOSE action in ledger
    let proposeActionId: string | undefined;

    if (featureFlag('actionLedger')) {
      const decision = policyEngine.evaluate({
        runId: opts.runId,
        cycleNumber: opts.cycle,
        role: opts.role,
        teamId: opts.teamId,
        actionClass: 'PROPOSE',
        targetKind: 'output',
        targetRef: `draft:${opts.role}`,
        summary: `Draft synthesis by ${opts.role}`,
      });

      proposeActionId = ledger.propose({
        cycleNumber: opts.cycle,
        role: opts.role,
        teamId: opts.teamId,
        actionClass: 'PROPOSE',
        targetKind: 'output',
        targetRef: `draft:${opts.role}`,
        riskTier: decision.riskTier,
        summary: `Draft synthesis by ${opts.role}`,
        input: { task: opts.task },
        reversible: false,
        policySnapshot: decision,
      });
    }

    // LLM call
    let response: import('@/types/index.js').LLMResponse;

    try {
      response = await adapter.run({
        model: opts.model,
        messages,
        temperature: 0.2,
        maxTokens: 2400,
      });
    } catch (err) {
      if (proposeActionId) {
        ledger.fail(proposeActionId, err instanceof Error ? err.message : String(err));
      }
      throw err;
    }

    // Redact output
    const safeContent = redactor.redact(response.content, {
      cycleNumber: opts.cycle,
      channel: 'output',
    }).text;

    // Budget accounting
    if (response.usage && featureFlag('teamBudgets') && opts.teamId) {
      const totalTokens = (response.usage.inputTokens ?? 0) + (response.usage.outputTokens ?? 0);
      budgets.spend({
        teamId,
        role: opts.role,
        cycleNumber: opts.cycle,
        budgetType: 'tokens',
        delta: totalTokens,
        reason: 'llm_call',
        metadata: { model: opts.model },
      });

      if (typeof response.costUsd === 'number') {
        budgets.spend({
          teamId,
          role: opts.role,
          cycleNumber: opts.cycle,
          budgetType: 'usd',
          delta: response.costUsd,
          reason: 'llm_call',
          metadata: { model: opts.model },
        });
      }
    }

    // Mark ledger applied
    if (proposeActionId) {
      ledger.apply(proposeActionId, {
        output: { evidencePackId, toolExecutionCount: executionIds.length },
      });
    }

    return {
      content: safeContent,
      evidencePackId,
      toolExecutionIds: executionIds,
      usage: response.usage,
      costUsd: response.costUsd,
    };
  }
}
15. Role prompt files