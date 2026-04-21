/**
 * AutoOrg — Typed Database Query Helpers
 *
 * Centralizes all DB queries. Every query is typed.
 * No raw SQL strings scattered across the codebase.
 */

import { getDb } from '@/db/migrate.js';

// ── Run queries ────────────────────────────────────────────────────────
export interface RunRow {
  id:            string;
  status:        string;
  total_cycles:  number;
  best_score:    number;
  total_cost_usd: number;
  started_at:    string;
  ended_at:      string | null;
  stop_reason:   string | null;
  config_json:   string;
}

export function getRun(runId: string): RunRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId) as RunRow | undefined;
  db.close();
  return row ?? null;
}

export function getLatestRun(): RunRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM runs ORDER BY started_at DESC LIMIT 1`).get() as RunRow | undefined;
  db.close();
  return row ?? null;
}

export function getAllRuns(): RunRow[] {
  const db   = getDb();
  const rows = db.prepare(`SELECT * FROM runs ORDER BY started_at DESC`).all() as RunRow[];
  db.close();
  return rows;
}

// ── Cycle queries ──────────────────────────────────────────────────────
export interface CycleRow {
  id:                  string;
  run_id:              string;
  cycle_number:        number;
  score_composite:     number | null;
  score_groundedness:  number | null;
  score_novelty:       number | null;
  score_consistency:   number | null;
  score_alignment:     number | null;
  decision:            string | null;
  decision_reason:     string | null;
  duration_ms:         number | null;
  cycle_cost_usd:      number | null;
  tokens_used:         number | null;
  git_commit_hash:     string | null;
  dream_ran:           number;
  proposal_summary:    string | null;
  started_at:          string;
  ended_at:            string | null;
}

export function getCyclesForRun(runId: string): CycleRow[] {
  const db   = getDb();
  const rows = db.prepare(`
    SELECT * FROM cycles WHERE run_id = ? ORDER BY cycle_number ASC
  `).all(runId) as CycleRow[];
  db.close();
  return rows;
}

export function getCycle(cycleId: string): CycleRow | null {
  const db  = getDb();
  const row = db.prepare(`SELECT * FROM cycles WHERE id = ?`).get(cycleId) as CycleRow | undefined;
  db.close();
  return row ?? null;
}

export function getScoreHistory(runId: string): Array<{
  cycle_number: number;
  composite:    number;
  decision:     string;
}> {
  const db   = getDb();
  const rows = db.prepare(`
    SELECT cycle_number, composite, decision
    FROM score_history
    WHERE run_id = ?
    ORDER BY cycle_number ASC
  `).all(runId) as Array<{ cycle_number: number; composite: number; decision: string }>;
  db.close();
  return rows;
}

// ── Agent execution queries ─────────────────────────────────────────────
export interface AgentExecRow {
  id:               string;
  cycle_id:         string;
  agent_role:       string;
  provider:         string;
  model:            string;
  prompt_tokens:    number;
  completion_tokens: number;
  cost_usd:         number;
  duration_ms:      number | null;
  status:           string;
  output_text:      string | null;
}

export function getAgentExecutionsForCycle(cycleId: string): AgentExecRow[] {
  const db   = getDb();
  const rows = db.prepare(`
    SELECT * FROM agent_executions WHERE cycle_id = ? ORDER BY started_at ASC
  `).all(cycleId) as AgentExecRow[];
  db.close();
  return rows;
}

export function getCostBreakdownByRole(runId: string): Array<{
  agent_role: string;
  total_cost: number;
  total_tokens: number;
  exec_count: number;
}> {
  const db   = getDb();
  const rows = db.prepare(`
    SELECT
      ae.agent_role,
      ROUND(SUM(ae.cost_usd), 6)         AS total_cost,
      SUM(ae.prompt_tokens + ae.completion_tokens) AS total_tokens,
      COUNT(*)                            AS exec_count
    FROM agent_executions ae
    JOIN cycles c ON c.id = ae.cycle_id
    WHERE c.run_id = ?
    GROUP BY ae.agent_role
    ORDER BY total_cost DESC
  `).all(runId) as Array<{ agent_role: string; total_cost: number; total_tokens: number; exec_count: number }>;
  db.close();
  return rows;
}

// ── Mailbox queries ─────────────────────────────────────────────────────
export interface MailboxRow {
  id:           string;
  from_agent:   string;
  to_agent:     string;
  message_type: string;
  content:      string;
  created_at:   string;
  read_at:      string | null;
  objection_severity: string | null;
  objection_resolved: number;
}

export function getMailboxForCycle(cycleId: string): MailboxRow[] {
  const db   = getDb();
  const rows = db.prepare(`
    SELECT * FROM mailbox_messages WHERE cycle_id = ? ORDER BY created_at ASC
  `).all(cycleId) as MailboxRow[];
  db.close();
  return rows;
}

// ── Objection queries ──────────────────────────────────────────────────
export interface ObjectionRow {
  id:              string;
  run_id:          string;
  cycle_raised:    number;
  cycle_resolved:  number | null;
  severity:        string;
  description:     string;
  proposed_fix:    string;
  resolved:        number;
  resolution_note: string | null;
}

export function getOpenObjections(runId: string): ObjectionRow[] {
  const db   = getDb();
  const rows = db.prepare(`
    SELECT * FROM objections
    WHERE run_id = ? AND resolved = 0
    ORDER BY cycle_raised DESC
  `).all(runId) as ObjectionRow[];
  db.close();
  return rows;
}

export function getAllObjections(runId: string): ObjectionRow[] {
  const db   = getDb();
  const rows = db.prepare(`
    SELECT * FROM objections WHERE run_id = ?
    ORDER BY cycle_raised DESC
  `).all(runId) as ObjectionRow[];
  db.close();
  return rows;
}

// ── Feature flag query ─────────────────────────────────────────────────
export function getFeatureFlags(): Record<string, boolean> {
  const db   = getDb();
  const rows = db.prepare(`SELECT flag_name, enabled FROM feature_flags`).all() as
    Array<{ flag_name: string; enabled: number }>;
  db.close();
  return Object.fromEntries(rows.map(r => [r.flag_name, r.enabled === 1]));
}

// ── Dashboard summary ──────────────────────────────────────────────────
export interface DashboardSummary {
  run:         RunRow;
  cycles:      CycleRow[];
  scoreHistory: Array<{ cycle_number: number; composite: number; decision: string }>;
  costByRole:  Array<{ agent_role: string; total_cost: number; total_tokens: number; exec_count: number }>;
  openObjections: ObjectionRow[];
  latestCycle: CycleRow | null;
}

export function getDashboardSummary(runId: string): DashboardSummary | null {
  const run = getRun(runId);
  if (!run) return null;

  const cycles         = getCyclesForRun(runId);
  const scoreHistory   = getScoreHistory(runId);
  const costByRole     = getCostBreakdownByRole(runId);
  const openObjections = getOpenObjections(runId);
  const latestCycle    = cycles.at(-1) ?? null;

  return { run, cycles, scoreHistory, costByRole, openObjections, latestCycle };
}
// ── Knowledge Graph queries ──────────────────────────────────────────
export interface GraphData {
  nodes: Array<{ id: string; label: string; type: string }>;
  links: Array<{ id: string; source: string; target: string; type: string }>;
}

export function getKnowledgeGraph(runId: string): GraphData {
  const db = getDb();
  
  // Get nodes associated with this run
  // Logic: Nodes are linked to extractions, extractions are linked to cycles, cycles are linked to runs.
  const nodes = db.prepare(`
    SELECT DISTINCT n.id, n.label, n.type
    FROM kg_nodes n
    JOIN kg_extractions e ON e.id = n.extraction_id
    JOIN cycles c ON c.id = e.cycle_id
    WHERE c.run_id = ?
  `).all(runId) as any[];

  // Get links between these nodes
  const links = db.prepare(`
    SELECT DISTINCT edge.id, edge.source_id as source, edge.target_id as target, edge.type
    FROM kg_edges edge
    JOIN kg_nodes n1 ON n1.id = edge.source_id
    JOIN kg_extractions e ON e.id = n1.extraction_id
    JOIN cycles c ON c.id = e.cycle_id
    WHERE c.run_id = ?
  `).all(runId) as any[];

  db.close();
  return { nodes, links };
}
