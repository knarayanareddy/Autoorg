// ============================================================
// AutoOrg — Complete Type Definitions
// ============================================================

import type { z } from 'zod';

// ── Providers ─────────────────────────────────────────────────────────
export interface ModelCost {
  inputPerMToken: number;
  outputPerMToken: number;
}

export type LLMProvider = 
  | 'anthropic'
  | 'openai'
  | 'ollama'
  | 'groq'
  | 'together'
  | 'gemini'
  | 'lmstudio'
  | 'custom';

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
  // Shared fields that agent-runner.ts uses via casts or direct access
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  model?: string;
  provider?: string;
}

export interface LLMRunOptions {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  stopSequences?: string[];
  stream?: boolean;
}

export interface LLMStructuredOptions<T> {
  model: string;
  messages: LLMMessage[];
  schema: z.ZodType<T>;
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
}

export interface LLMAdapter {
  readonly provider: LLMProvider;
  run(opts: LLMRunOptions): Promise<LLMResponse>;
  structured<T>(opts: LLMStructuredOptions<T>): Promise<T>;
}

export type AgentRole = 
  | 'CEO' 
  | 'Engineer' 
  | 'Critic' 
  | 'DevilsAdvocate' 
  | 'Archivist'
  | 'RatchetJudge' 
  | 'DreamAgent'
  | 'UltraPlanner';

export type RatchetDecision = 'COMMIT' | 'REVERT' | 'DISQUALIFIED' | 'TIMEOUT' | 'ERROR';
export type ObjectionSeverity = 'BLOCKER' | 'MAJOR' | 'MINOR';
export type RunStatus = 'running' | 'completed' | 'failed' | 'stopped';
export type StopReason = 
  | 'max_cycles' 
  | 'plateau' 
  | 'consecutive_rejects' 
  | 'budget' 
  | 'target_score' 
  | 'manual_stop'
  | 'error';

// ── Model Configuration ────────────────────────────────────────────────
export interface ModelConfig {
  provider: LLMProvider;
  model: string;
  baseUrl?: string;           // For custom/local endpoints
  apiKey?: string;            // Override env var
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

export type ModelMap = Record<AgentRole, ModelConfig>;

// ── org.md Parsed Config ───────────────────────────────────────────────
export interface OrgConfig {
  mission: string;
  seedMaterial: string;
  constraints: string[];
  activeRoles: AgentRole[];
  modelAssignments: Partial<ModelMap>;
  maxCycles: number;
  plateauCycles: number;
  consecutiveRejects: number;
  maxApiSpendUsd: number;
  targetScore: number;
  dreamInterval: number;
  maxWorkersParallel: number;
  cycleTimeoutMs: number;
  contentHash: string;
}

// ── Ratchet Scoring ────────────────────────────────────────────────────
export interface RatchetScore {
  groundedness: number;
  novelty: number;
  consistency: number;
  alignment: number;
  composite: number;
  decision: RatchetDecision;
  justification: string;
  objections: CriticObjection[];
  blockerCount: number;
  majorCount: number;
  disqualificationReason?: string;
}

export interface CriticObjection {
  id: string;
  severity: ObjectionSeverity;
  description: string;
  proposedFix: string;
  resolved: boolean;
  raisedCycle: number;
}

// ── Agent I/O ──────────────────────────────────────────────────────────
export interface AgentTask {
  from: AgentRole | 'ORCHESTRATOR';
  to: AgentRole;
  cycleNumber: number;
  runId: string;
  instruction: string;
  contextRefs: string[];
  metadata?: any;
  timestamp: string;
}

export interface AgentOutput {
  from: AgentRole;
  cycleNumber: number;
  runId: string;
  content: string;
  structuredData?: any;
  tokensUsed: number;
  costUsd: number;
  durationMs: number;
  timestamp: string;
}

export interface CriticOutput extends AgentOutput {
  steelman: string;
  objections: {
    id: string;
    severity: "BLOCKER" | "MAJOR" | "MINOR";
    description: string;
    evidence: string;
    fix: string;
  }[];
  resolved_from_previous: string[];
  overall_verdict: "ACCEPTABLE" | "REJECT" | "NEEDS_WORK";
  verdict_reason: string;
}

export interface JudgeOutput extends AgentOutput {
  structuredData: RatchetScore;
}

// ── Cycle State ─────────────────────────────────────────────────────────
export interface CycleState {
  id: string;
  runId: string;
  cycleNumber: number;
  phase: 'assign' | 'work' | 'synthesize' | 'judge' | 'ratchet' | 'memory' | 'complete';
  ceoAssignment?: AgentOutput;
  engineerOutput?: AgentOutput;
  criticOutput?: CriticOutput;
  advocateOutput?: AgentOutput;
  archivistOutput?: AgentOutput;
  ceoSynthesis?: AgentOutput;
  judgeOutput?: JudgeOutput;
  score?: RatchetScore;
  decision?: RatchetDecision;
  previousBestScore: number;
  proposalPath?: string;
  gitCommitHash?: string;
  totalCostUsd: number;
  totalTokens: number;
  startedAt: Date;
  endedAt?: Date;
}

// ── Run State ────────────────────────────────────────────────────────────
export interface RunState {
  id: string;
  config: OrgConfig;
  status: RunStatus;
  cycleCount: number;
  bestScore: number;
  plateauCount: number;
  consecutiveRejects: number;
  totalCostUsd: number;
  currentCycle?: CycleState;
  lastCommitHash?: string;
  startedAt: Date;
  endedAt?: Date;
  stopReason?: StopReason;
}

// ── Orchestrator Events ────────────────────────────────────────────────
export type OrchestratorEvent =
  | { type: 'run_start';    runId: string; config: OrgConfig }
  | { type: 'cycle_start';  cycleNumber: number; previousBest: number }
  | { type: 'phase_change'; phase: CycleState['phase'] }
  | { type: 'agent_start';  role: AgentRole; model: string }
  | { type: 'agent_done';   role: AgentRole; costUsd: number; tokens: number }
  | { type: 'scored';       score: RatchetScore }
  | { type: 'committed';    newBest: number; delta: number; commitHash: string }
  | { type: 'reverted';     score: number; best: number }
  | { type: 'dream_start';  cycleNumber: number }
  | { type: 'dream_done';   factsAdded: number; contradictionsRemoved: number }
  | { type: 'run_complete'; stopReason: StopReason; finalBest: number; totalCycles: number }
  | { type: 'error';        message: string; cycleNumber?: number; fatal: boolean }
  | { type: 'budget_warning'; spent: number; limit: number };

// ── Feature Flags ──────────────────────────────────────────────────────
export type FeatureFlag =
  | 'autoDream'
  | 'graphRag'
  | 'parallelWorkers'
  | 'gitAuditTrail'
  | 'memoryTiers'
  | 'constitutionLock'
  | 'maxCostGuard'
  | 'resultsTsv'
  | 'ultraplan'
  | 'coordinatorMode'
  | 'agentInterviews'
  | 'crossDomainSim'
  | 'buddyMode'
  | 'kairosDaemon'
  | 'humanCheckpoint'
  | 'webDashboard'
  | 'streamingOutput'
  | 'multiOrg';
