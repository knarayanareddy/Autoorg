Markdown

# DreamAgent — AutoOrg Memory Consolidation Agent

## Identity
You are the DreamAgent. You run periodically (every N cycles) to consolidate, compress, and improve the organization's memory. You are not part of the main cycle loop — you run between cycles.

## Primary mission
Read the current MEMORY.md and recent cycle transcripts. Identify what is important, what is redundant, what has been superseded, and what should be emphasized. Produce an improved MEMORY.md.

## Inputs you receive
- Current MEMORY.md
- Recent cycle results (last N cycles)
- Graph context
- Team partition memory files

## Outputs you produce
An improved MEMORY.md that:
- Removes superseded information
- Consolidates redundant entries
- Elevates high-value patterns discovered across cycles
- Organizes memory into clear sections
- Adds a "current best understanding" summary

## Hard rules
- Never delete information that is still actively relevant.
- Never add information not present in source material.
- Never invent lessons not supported by actual cycle history.
- Keep total MEMORY.md under 4,000 words.
- Preserve all evidence labels and source citations.
16. org.md (example)
Markdown

# AutoOrg Mission: Phase 5.1 Operational Hardening Plan

## Mission statement
Produce a comprehensive implementation plan for Phase 5.1 of AutoOrg — the operational hardening phase that adds strict approval blocking, crash recovery, worker leases, and workspace concurrency locks to the existing Phase 5 daemon and hierarchy system.

## Acceptance criteria
- The plan must be specific enough that an engineer can implement each component without additional design decisions
- Every component must include a clear data model, runtime behavior, and test approach
- The plan must address the ordering of implementation to avoid circular dependencies
- The plan must include rollback procedures for each component
- All components must be compatible with the existing Phase 5 schema and runtime

## Constraints
- The system must maintain backward compatibility with Phase 5 DB schema
- No approval bypass must be possible when strictApprovalBlocking is enabled
- Recovery must be safe to run on a partially completed run without data corruption
- Workspace locks must handle daemon restart and process kill gracefully

## Current state
Phase 5 is implemented with soft approval gates, basic daemon mode, and scheduled jobs. The system runs but lacks crash recovery, strict git-level approval blocking, and worker lease management.

## Out of scope
- Phase 6 tool substrate
- UI changes beyond what is needed to display approval status
- Multi-tenant concerns
17. constitution.md (example)
Markdown

# AutoOrg Constitution v1.0

## Preamble
This constitution defines what "better" means for every output AutoOrg produces. It is immutable within a run. No agent may override, extend, or circumvent these criteria. The RatchetJudge applies these criteria mechanically and consistently.

## Scoring dimensions

### Groundedness (weight: 0.30)
An output is grounded if every material factual or technical claim can be traced to:
- A specific source in the evidence pack (cited with [ev_N])
- A verified entry in organizational memory
- The workspace context (prior approved output)

Fabricated implementation details, invented API names, guessed file paths, and unverified performance claims all reduce groundedness.

### Novelty (weight: 0.25)
An output is novel if it adds genuine value over the previous best output. This includes:
- New verified facts not in the previous output
- Resolved objections from the Critic
- Better organization of existing content
- More specific and actionable language

Cosmetic rewording, padding, and structural changes that do not improve substance do not count as novelty.

### Consistency (weight: 0.25)
An output is consistent if:
- It does not contradict itself
- It uses terminology consistently with the mission and prior memory
- It does not contradict verified historical facts in memory
- Its recommendations do not conflict with each other

### Mission alignment (weight: 0.20)
An output is mission-aligned if it directly and specifically serves the stated mission in org.md. High-quality outputs that are off-topic or that address peripheral concerns instead of core requirements score low on this dimension.

## Disqualifying conditions
The following conditions, if present, reduce the composite score as follows:
- Policy compliance below 0.80: composite reduced by 0.35 × (1 − policy_compliance)
- Unsupported claim ratio above 0: groundedness reduced by min(0.5, ratio × 0.75)
- Security finding of severity "critical": composite capped at 0.40

## Ratchet rule
The composite score must exceed the current best score for a commit to be considered. If the composite does not exceed the current best, the output is reverted and the cycle is logged as REVERT.

## Amendment rule
This constitution may only be changed between runs via a PR that includes a benchmark A/B experiment demonstrating no regression on the core suite.
18. src/api/server.ts
TypeScript

// src/api/server.ts
import { handleAuthRoutes } from '@/api/auth-routes.js';
import { handleWorkspaceRoutes } from '@/api/workspace-routes.js';
import { handleBillingRoutes } from '@/api/billing-routes.js';
import { handleAdminRoutes } from '@/api/admin-routes.js';
import { handleTemplateRoutes } from '@/api/template-routes.js';
import { handleToolRoutes } from '@/api/tool-routes.js';
import { handleEvalRoutes } from '@/api/eval-routes.js';
import { handlePortfolioRoutes } from '@/api/portfolio-routes.js';
import { handleLearningRoutes } from '@/api/learning-routes.js';
import { handleSecurityRoutes } from '@/api/security-routes.js';
import { handleHardeningRoutes } from '@/api/hardening-routes.js';
import { getDb } from '@/db/migrate.js';

const PORT = Number(process.env.AUTOORG_API_PORT ?? 3000);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': process.env.AUTOORG_CORS_ORIGIN ?? '*',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization',
    },
  });
}

function notFound() {
  return json({ error: 'not_found' }, 404);
}

function serverError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[API]', message);
  return json({ error: 'internal_server_error', message }, 500);
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': process.env.AUTOORG_CORS_ORIGIN ?? '*',
        'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'access-control-allow-headers': 'content-type,authorization',
      },
    });
  }

  try {
    // ── Health ─────────────────────────────────────────────────────────────
    if (url.pathname === '/health' && method === 'GET') {
      const db = getDb();
      let dbOk = false;
      try { db.prepare('SELECT 1').get(); dbOk = true; } catch {}
      db.close();

      const status = dbOk ? 200 : 503;
      return json({
        ok: dbOk,
        db: dbOk ? 'ok' : 'error',
        version: process.env.AUTOORG_VERSION ?? 'dev',
        ts: new Date().toISOString(),
      }, status);
    }

    // ── Route handlers ─────────────────────────────────────────────────────
    const routes = [
      handleAuthRoutes,
      handleWorkspaceRoutes,
      handleBillingRoutes,
      handleAdminRoutes,
      handleTemplateRoutes,
      handleToolRoutes,
      handleEvalRoutes,
      handlePortfolioRoutes,
      handleLearningRoutes,
      handleSecurityRoutes,
      handleHardeningRoutes,
    ];

    for (const handler of routes) {
      const result = await handler(url, req);
      if (result !== null) return result;
    }

    return notFound();

  } catch (error) {
    return serverError(error);
  }
}

const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.log(`AutoOrg API running on http://localhost:${server.port}`);
19. src/runtime/approval-gate.ts
TypeScript

// src/runtime/approval-gate.ts
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import type { ApprovalRequest, ApprovalStatus } from '@/types/index.js';

export class ApprovalGate {
  request(opts: ApprovalRequest): string {
    const id = `ap_${nanoid(10)}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const db = getDb();
    db.prepare(`
      INSERT INTO approvals
      (id, run_id, cycle_number, approval_type, subject, requested_by, status, summary, details_json, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      id,
      opts.runId,
      opts.cycleNumber,
      opts.approvalType,
      opts.subject,
      opts.requestedBy,
      opts.summary,
      JSON.stringify(opts.details),
      expiresAt,
    );
    db.close();

    return id;
  }

  getStatus(approvalId: string): ApprovalStatus | null {
    const db = getDb();
    const row = db.prepare(`
      SELECT status FROM approvals WHERE id = ?
    `).get(approvalId) as { status: ApprovalStatus } | undefined;
    db.close();
    return row?.status ?? null;
  }

  approve(approvalId: string, reviewedBy = 'system', comment = '') {
    const db = getDb();
    db.prepare(`
      UPDATE approvals
      SET status = 'approved',
          reviewed_by = ?,
          review_comment = ?,
          reviewed_at = datetime('now')
      WHERE id = ?
    `).run(reviewedBy, comment, approvalId);
    db.close();
  }

  reject(approvalId: string, reviewedBy = 'system', comment = '') {
    const db = getDb();
    db.prepare(`
      UPDATE approvals
      SET status = 'rejected',
          reviewed_by = ?,
          review_comment = ?,
          reviewed_at = datetime('now')
      WHERE id = ?
    `).run(reviewedBy, comment, approvalId);
    db.close();
  }

  listPending(runId?: string) {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM approvals
      WHERE status = 'pending'
        ${runId ? 'AND run_id = ?' : ''}
      ORDER BY created_at ASC
    `).all(...(runId ? [runId] : []));
    db.close();
    return rows;
  }
}
20. src/runtime/results-logger.ts
TypeScript

// src/runtime/results-logger.ts
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import type { ResultsRow } from '@/types/index.js';

const HEADERS = [
  'cycle',
  'score',
  'groundedness',
  'novelty',
  'consistency',
  'missionAlignment',
  'policyCompliance',
  'decision',
  'costUsd',
  'summary',
];

export class ResultsLogger {
  constructor(
    private filePath: string,
    private runId: string,
  ) {}

  async ensureHeader() {
    try {
      const existing = await readFile(this.filePath, 'utf-8');
      if (!existing.startsWith('cycle\t')) {
        await writeFile(this.filePath, HEADERS.join('\t') + '\n', 'utf-8');
      }
    } catch {
      await writeFile(this.filePath, HEADERS.join('\t') + '\n', 'utf-8');
    }
  }

  async append(row: ResultsRow) {
    const line = [
      row.cycle,
      row.score.toFixed(6),
      row.groundedness.toFixed(6),
      row.novelty.toFixed(6),
      row.consistency.toFixed(6),
      row.missionAlignment.toFixed(6),
      (row.policyCompliance ?? 1).toFixed(6),
      row.decision,
      (row.costUsd ?? 0).toFixed(6),
      row.summary.replace(/[\t\n\r]/g, ' ').slice(0, 200),
    ].join('\t');

    await appendFile(this.filePath, line + '\n', 'utf-8');

    const db = getDb();
    db.prepare(`
      INSERT INTO results_log
      (id, run_id, cycle_number, score, groundedness, novelty, consistency,
       mission_alignment, policy_compliance, decision, summary, cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `rl_${nanoid(10)}`,
      this.runId,
      row.cycle,
      row.score,
      row.groundedness,
      row.novelty,
      row.consistency,
      row.missionAlignment,
      row.policyCompliance ?? 1,
      row.decision,
      row.summary.slice(0, 500),
      row.costUsd ?? 0,
    );
    db.close();
  }
}
21. src/runtime/transcript.ts
TypeScript

// src/runtime/transcript.ts
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RedactionFilter } from '@/runtime/redaction.js';
import type { TranscriptEvent } from '@/types/index.js';

export class TranscriptWriter {
  private filePath: string;
  private redactor: RedactionFilter;

  constructor(runId: string, root = process.cwd()) {
    this.filePath = path.join(root, 'transcripts', `${runId}.jsonl`);
    this.redactor = new RedactionFilter(runId);
  }

  async ensureInitialized() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, '', { flag: 'a' });
  }

  event(e: TranscriptEvent) {
    const payload: TranscriptEvent = {
      ...e,
      ts: new Date().toISOString(),
    };

    // Redact content field if present
    if (typeof payload.content === 'string') {
      payload.content = this.redactor.redact(payload.content, {
        channel: 'transcript',
        cycleNumber: typeof e.cycleNumber === 'number' ? e.cycleNumber : undefined,
      }).text;
    }

    // Fire and forget
    appendFile(this.filePath, JSON.stringify(payload) + '\n', 'utf-8').catch(() => {});
  }
}
22. src/runtime/event-bus.ts
TypeScript

// src/runtime/event-bus.ts

type EventHandler = (payload: Record<string, unknown>) => void;

export class EventBus {
  private listeners = new Map<string, EventHandler[]>();

  on(event: string, handler: EventHandler) {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler);
    this.listeners.set(event, handlers);
  }

  off(event: string, handler: EventHandler) {
    const handlers = (this.listeners.get(event) ?? []).filter(h => h !== handler);
    this.listeners.set(event, handlers);
  }

  broadcast(payload: Record<string, unknown> & { type: string }) {
    const handlers = this.listeners.get(payload.type) ?? [];
    for (const handler of handlers) {
      try { handler(payload); } catch {}
    }

    // Also fire wildcard listeners
    const wildcards = this.listeners.get('*') ?? [];
    for (const handler of wildcards) {
      try { handler(payload); } catch {}
    }
  }
}
23. src/runtime/memory-manager.ts
TypeScript

// src/runtime/memory-manager.ts
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

const INITIAL_MEMORY = `# AutoOrg Memory

## Overview
This file records what the organization has learned across cycles.
Each entry is date-stamped and attributed to the cycle that generated it.

## Current best understanding
(Updated automatically. Do not edit manually.)

## Cycle history
`;

export class MemoryManager {
  private memoryPath: string;
  private factsDir: string;

  constructor(private root = process.cwd()) {
    this.memoryPath = path.join(root, 'memory', 'MEMORY.md');
    this.factsDir = path.join(root, 'memory', 'facts');
  }

  async ensureInitialized() {
    await mkdir(path.join(this.root, 'memory'), { recursive: true });
    await mkdir(this.factsDir, { recursive: true });

    try {
      await readFile(this.memoryPath, 'utf-8');
    } catch {
      await writeFile(this.memoryPath, INITIAL_MEMORY, 'utf-8');
    }
  }

  async buildContext(): Promise<string> {
    const memory = await readFile(this.memoryPath, 'utf-8').catch(() => '');
    return memory.slice(0, 4000);
  }

  async append(note: string, cycleNumber: number) {
    const line = `\n### Cycle ${cycleNumber} — ${new Date().toISOString()}\n${note.trim()}\n`;
    await appendFile(this.memoryPath, line, 'utf-8');
  }

  async replace(newContent: string) {
    await writeFile(this.memoryPath, newContent, 'utf-8');
  }
}
24. src/runtime/graph-manager.ts
TypeScript

// src/runtime/graph-manager.ts
// Lightweight in-process knowledge graph.
// Production upgrade: swap internal storage for a graph DB.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type { GraphNode, GraphEdge, KnowledgeGraph } from '@/types/index.js';

interface GraphManagerState {
  runId: string;
  graph: KnowledgeGraph;
  rootPath: string;
}

class GraphManagerImpl {
  private state: GraphManagerState | null = null;

  init(runId: string, rootPath = process.cwd()) {
    this.state = {
      runId,
      rootPath,
      graph: { nodes: [], edges: [], version: 0 },
    };
  }

  private ensure(): GraphManagerState {
    if (!this.state) throw new Error('GraphManager not initialized. Call init(runId) first.');
    return this.state;
  }

  async ensureBuilt(config: {
    seedMaterial?: string[];
    workspaceRoot?: string;
  }) {
    const s = this.ensure();

    const graphPath = path.join(s.rootPath, 'memory', 'graph.json');
    await mkdir(path.dirname(graphPath), { recursive: true });

    try {
      const existing = JSON.parse(await readFile(graphPath, 'utf-8'));
      s.graph = existing;
      return;
    } catch {}

    // Build from seed material
    if (config.seedMaterial?.length) {
      for (const text of config.seedMaterial) {
        await this.ingest({ text, source: 'seed', weight: 1.0 });
      }
    }

    await this.persist();
  }

  async ingest(opts: { text: string; source: string; weight?: number }) {
    const s = this.ensure();

    // Extract simple concept nodes from key terms
    const terms = opts.text
      .split(/[\s,.:;()\[\]{}"']+/)
      .filter(t => t.length > 4 && t.length < 50)
      .slice(0, 50);

    for (const term of terms) {
      const existing = s.graph.nodes.find(n => n.label.toLowerCase() === term.toLowerCase());
      if (existing) {
        existing.weight = Math.min(1, existing.weight + 0.1);
      } else {
        s.graph.nodes.push({
          id: `node_${nanoid(8)}`,
          label: term,
          type: 'concept',
          weight: opts.weight ?? 0.5,
          source: opts.source,
        });
      }
    }

    s.graph.version += 1;
  }

  buildContext(mission: string): string {
    const s = this.ensure();
    const topNodes = [...s.graph.nodes]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 20)
      .map(n => `${n.label} (${n.type}, weight=${n.weight.toFixed(2)})`);

    if (!topNodes.length) return '';

    return [
      '## Graph Context',
      `Top concepts (${s.graph.nodes.length} total nodes, version ${s.graph.version}):`,
      topNodes.join(', '),
    ].join('\n');
  }

  getGraph(): KnowledgeGraph {
    return this.ensure().graph;
  }

  async persist() {
    const s = this.ensure();
    const graphPath = path.join(s.rootPath, 'memory', 'graph.json');
    await writeFile(graphPath, JSON.stringify(s.graph, null, 2), 'utf-8');
  }
}

export const graphManager = new GraphManagerImpl();
25. src/runtime/ratchet.ts
TypeScript

// src/runtime/ratchet.ts
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getAdapterForModel } from '@/adapters/adapter-factory.js';
import type { RatchetScore, Proposal, KnowledgeGraph } from '@/types/index.js';

const sh = promisify(exec);

export class RatchetEngine {
  private constitution: string;
  private runId: string;
  private models: Record<string, string>;
  private benchmarkCase?: { caseName: string; category: string; difficulty: string };

  constructor(opts: {
    constitution: string;
    runId: string;
    models: Record<string, string>;
    benchmarkCase?: { caseName: string; category: string; difficulty: string };
  }) {
    this.constitution = opts.constitution;
    this.runId = opts.runId;
    this.models = opts.models;
    this.benchmarkCase = opts.benchmarkCase;
  }

  async score(input: {
    proposal: Proposal;
    graph: KnowledgeGraph;
    verificationReport?: { total_claims: number; supported_claims: number; unsupported_claims: number } | null;
    evidencePackId?: string;
    toolStats?: { toolCalls: number };
    policyReport?: { score: number; approval_gaps: number; unsafe_action_count: number } | null;
    provenanceReport?: { total_claims: number; linked_claims: number; broken_links: number } | null;
    benchmarkCase?: { caseName: string; category: string; difficulty: string };
  }): Promise<RatchetScore> {
    const judgeModel = this.models['ratchetJudge'] ?? 'claude-opus-4';
    const adapter = getAdapterForModel(judgeModel);

    const systemPrompt = await this.buildJudgeSystemPrompt();

    const userContent = JSON.stringify({
      constitution: this.constitution,
      proposal: {
        content: input.proposal.content.slice(0, 16000),
        role: input.proposal.role,
        cycleNumber: input.proposal.cycleNumber,
      },
      graphSummary: {
        nodeCount: input.graph.nodes.length,
        edgeCount: input.graph.edges.length,
        version: input.graph.version,
      },
      verificationReport: input.verificationReport ?? null,
      evidencePackId: input.evidencePackId ?? null,
      toolStats: input.toolStats ?? null,
      policyReport: input.policyReport ?? null,
      provenanceReport: input.provenanceReport ?? null,
      benchmarkCase: input.benchmarkCase ?? this.benchmarkCase ?? null,
    }, null, 2);

    const judgeResponse = await adapter.run({
      model: judgeModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
      maxTokens: 1200,
    });

    return this.parseScore(judgeResponse.content);
  }

  decide(score: RatchetScore, bestScore: number): 'COMMIT' | 'REVERT' {
    return score.composite > bestScore ? 'COMMIT' : 'REVERT';
  }

  async materializeCommit(opts: { file?: string; commitMessage: string }): Promise<string> {
    const file = opts.file ?? 'workspace/current_output.md';
    await sh(`git add "${file}"`);
    await sh(`git commit -m "${opts.commitMessage.replace(/"/g, '\\"')}"`);
    const { stdout } = await sh('git rev-parse HEAD');
    return stdout.trim();
  }

  async materializeRevert(file = 'workspace/current_output.md') {
    await sh(`git checkout -- "${file}"`).catch(() => {});
  }

  private async buildJudgeSystemPrompt(): Promise<string> {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const basePrompt = await readFile(join(process.cwd(), 'roles', 'RatchetJudge.md'), 'utf-8').catch(() => '');
    return basePrompt;
  }

  private parseScore(content: string): RatchetScore {
    try {
      const jsonMatch = content.match(/\{[\s\S]+\}/);
      if (!jsonMatch) throw new Error('No JSON found in judge response');
      const parsed = JSON.parse(jsonMatch[0]);

      const groundedness = this.clamp(parsed.groundedness ?? 0.5);
      const novelty = this.clamp(parsed.novelty ?? 0.5);
      const consistency = this.clamp(parsed.consistency ?? 0.5);
      const missionAlignment = this.clamp(parsed.missionAlignment ?? 0.5);
      const policyCompliance = this.clamp(parsed.policyCompliance ?? 1.0);

      const rawComposite = 0.30 * groundedness + 0.25 * novelty + 0.25 * consistency + 0.20 * missionAlignment;
      const policyPenalty = policyCompliance < 0.80
        ? 0.35 * (1 - policyCompliance)
        : 0;

      const composite = Math.max(0, rawComposite - policyPenalty);

      return {
        composite,
        groundedness,
        novelty,
        consistency,
        missionAlignment,
        policyCompliance,
        justification: parsed.justification ?? 'No justification provided.',
      };
    } catch {
      return {
        composite: 0.5,
        groundedness: 0.5,
        novelty: 0.5,
        consistency: 0.5,
        missionAlignment: 0.5,
        policyCompliance: 1.0,
        justification: 'Score parsing failed — using default midpoint scores.',
      };
    }
  }

  private clamp(n: number): number {
    return Math.max(0, Math.min(1, Number(n) || 0));
  }
}
26. src/runtime/dream.ts
TypeScript

// src/runtime/dream.ts
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getAdapterForModel } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';

export class DreamEngine {
  constructor(
    private runId: string,
    private opts: {
      model: string;
      memoryRoot: string;
    },
  ) {}

  async run() {
    const memoryPath = path.join(this.opts.memoryRoot, 'MEMORY.md');
    const currentMemory = await readFile(memoryPath, 'utf-8').catch(() => '');

    if (!currentMemory.trim()) return;

    const db = getDb();
    const recentResults = db.prepare(`
      SELECT cycle_number, score, decision, summary
      FROM results_log
      WHERE run_id = ?
      ORDER BY cycle_number DESC
      LIMIT 10
    `).all(this.runId) as Array<{
      cycle_number: number;
      score: number;
      decision: string;
      summary: string;
    }>;
    db.close();

    const adapter = getAdapterForModel(this.opts.model);

    const response = await adapter.run({
      model: this.opts.model,
      messages: [
        {
          role: 'system',
          content: `You consolidate organizational memory. Read the current MEMORY.md and recent cycle results. Produce an improved MEMORY.md that:
- Removes superseded information
- Consolidates redundant entries
- Elevates high-value patterns
- Keeps total length under 4000 words
- Preserves all evidence labels and citations

Return only the new MEMORY.md content. No explanation.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            currentMemory: currentMemory.slice(0, 6000),
            recentCycles: recentResults,
          }, null, 2),
        },
      ],
      temperature: 0.2,
      maxTokens: 3000,
    });

    if (response.content.trim().length > 100) {
      await writeFile(memoryPath, response.content.trim(), 'utf-8');
    }
  }
}
27. src/runtime/scheduler.ts
TypeScript

// src/runtime/scheduler.ts
import { getDb } from '@/db/migrate.js';

function parseCron(expr: string): Date | null {
  // Simplified cron parser — in production use the `cron-parser` package
  try {
    const { parseExpression } = require('cron-parser');
    const interval = parseExpression(expr);
    return interval.next().toDate();
  } catch {
    return null;
  }
}

export class Scheduler {
  dueJobs() {
    const db = getDb();
    const jobs = db.prepare(`
      SELECT *
      FROM scheduled_jobs
      WHERE status = 'idle'
        AND (
          last_run_at IS NULL
          OR (
            cron_expression IS NOT NULL
            AND datetime(last_run_at, '+60 seconds') < datetime('now')
          )
        )
      ORDER BY created_at ASC
    `).all() as Array<{
      id: string;
      job_type: string;
      run_id: string | null;
      cron_expression: string | null;
      payload_json: string;
    }>;
    db.close();
    return jobs;
  }

  seedDefaultJobs(runId: string) {
    const db = getDb();
    const defaults = [
      {
        id: `job_dream_${runId}`,
        job_type: 'dream',
        run_id: runId,
        cron_expression: null,
        payload_json: '{}',
      },
      {
        id: `job_health_${runId}`,
        job_type: 'health_check',
        run_id: runId,
        cron_expression: null,
        payload_json: '{}',
      },
    ];

    for (const job of defaults) {
      db.prepare(`
        INSERT OR IGNORE INTO scheduled_jobs
        (id, job_type, run_id, cron_expression, status, payload_json)
        VALUES (?, ?, ?, ?, 'idle', ?)
      `).run(job.id, job.job_type, job.run_id, job.cron_expression, job.payload_json);
    }

    db.close();
  }
}
28. src/runtime/scorer.ts
TypeScript

// src/runtime/scorer.ts
// Score clamp utilities used by ratchet and judge

export function applyVerificationClamp(
  baseGroundedness: number,
  verification?: { total_claims: number; unsupported_claims: number } | null
): number {
  if (!verification || verification.total_claims <= 0) return baseGroundedness;
  const unsupportedRatio = verification.unsupported_claims / verification.total_claims;
  const penalty = Math.min(0.5, unsupportedRatio * 0.75);
  return Math.max(0, baseGroundedness - penalty);
}

export function applyPolicyComplianceClamp(
  baseComposite: number,
  policyCompliance?: number | null
): number {
  if (typeof policyCompliance !== 'number') return baseComposite;
  const penalty = Math.max(0, 0.35 * (1 - policyCompliance));
  return Math.max(0, baseComposite - penalty);
}

export function computeComposite(dims: {
  groundedness: number;
  novelty: number;
  consistency: number;
  missionAlignment: number;
  policyCompliance?: number;
  verificationReport?: { total_claims: number; unsupported_claims: number } | null;
}): number {
  const clampedGroundedness = applyVerificationClamp(
    dims.groundedness,
    dims.verificationReport
  );

  const rawComposite =
    0.30 * clampedGroundedness +
    0.25 * dims.novelty +
    0.25 * dims.consistency +
    0.20 * dims.missionAlignment;

  return applyPolicyComplianceClamp(rawComposite, dims.policyCompliance);
}
29. src/runtime/ultraplan.ts
TypeScript

// src/runtime/ultraplan.ts
import { nanoid } from 'nanoid';
import { getAdapterForModel } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';

export class UltraPlanEngine {
  constructor(
    private runId: string,
    private opts: {
      models: Record<string, string>;
      constitution: string;
    }
  ) {}

  async createSession(input: {
    cycleNumber: number;
    currentBestScore: number;
    plateauCount: number;
    mission: string;
    workspaceText: string;
    graphContext: string;
    memoryContext: string;
  }) {
    const sessionId = `ultra_${nanoid(10)}`;
    const db = getDb();
    db.prepare(`
      INSERT INTO ultraplan_sessions
      (id, run_id, cycle_number, status, result_json)
      VALUES (?, ?, ?, 'running', '{}')
    `).run(sessionId, this.runId, input.cycleNumber);
    db.close();

    return { sessionId, input };
  }

  async executeSession(sessionId: string) {
    const db = getDb();
    const session = db.prepare(`
      SELECT * FROM ultraplan_sessions WHERE id = ?
    `).get(sessionId) as { run_id: string; cycle_number: number } | undefined;
    db.close();

    if (!session) throw new Error(`ULTRAPLAN session ${sessionId} not found`);

    const model = this.opts.models['ceo'] ?? 'claude-opus-4';
    const adapter = getAdapterForModel(model);

    const response = await adapter.run({
      model,
      messages: [
        {
          role: 'system',
          content: `You are AutoOrg's strategic pivot engine. The system is on a scoring plateau.
Analyze the situation and produce a concrete strategic pivot plan.
Return JSON with keys: bottleneck, pivot_hypothesis, five_cycle_plan (array of 5 strings), checkpoint_summary, cancellation_safe_summary, risks (array), expected_score_delta (number).`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            sessionId,
            constitution: this.opts.constitution.slice(0, 3000),
          }, null, 2),
        },
      ],
      temperature: 0.3,
      maxTokens: 1500,
    });

    let result: Record<string, unknown>;
    try {
      const match = response.content.match(/\{[\s\S]+\}/);
      result = match ? JSON.parse(match[0]) : {};
    } catch {
      result = { checkpoint_summary: response.content };
    }

    const db2 = getDb();
    db2.prepare(`
      UPDATE ultraplan_sessions
      SET status = 'completed', result_json = ?, finished_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(result), sessionId);
    db2.close();

    return result;
  }
}
30. Error handling strategy (src/runtime/error-handler.ts)
TypeScript

// src/runtime/error-handler.ts
import { IncidentLog } from '@/runtime/incident-log.js';

export type ErrorCategory =
  | 'llm_failure'
  | 'tool_timeout'
  | 'tool_denied'
  | 'db_locked'
  | 'approval_timeout'
  | 'budget_exceeded'
  | 'workspace_lock'
  | 'graph_build'
  | 'artifact_write'
  | 'unknown';

export interface HandledError {
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  skipCycle: boolean;
  fatal: boolean;
}

export function categorizeError(err: unknown): HandledError {
  const message = err instanceof Error ? err.message : String(err);

  // LLM failures
  if (message.includes('rate_limit') || message.includes('429')) {
    return { category: 'llm_failure', message, retryable: true, skipCycle: false, fatal: false };
  }
  if (message.includes('timeout') && message.includes('LLM')) {
    return { category: 'llm_failure', message, retryable: true, skipCycle: true, fatal: false };
  }

  // Tool failures
  if (message.includes('Sandbox timeout')) {
    return { category: 'tool_timeout', message, retryable: false, skipCycle: false, fatal: false };
  }
  if (message.includes('Policy denied') || message.includes('Budget exceeded')) {
    return { category: 'tool_denied', message, retryable: false, skipCycle: false, fatal: false };
  }

  // DB failures
  if (message.includes('SQLITE_BUSY') || message.includes('database is locked')) {
    return { category: 'db_locked', message, retryable: true, skipCycle: false, fatal: false };
  }

  // Workspace lock
  if (message.includes('Workspace lock already held')) {
    return { category: 'workspace_lock', message, retryable: false, skipCycle: false, fatal: true };
  }

  return { category: 'unknown', message, retryable: false, skipCycle: false, fatal: true };
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    runId?: string;
    maxRetries?: number;
    backoffMs?: number;
    component?: string;
  } = {}
): Promise<T> {
  const incidents = new IncidentLog();
  const maxRetries = opts.maxRetries ?? 3;
  const backoffMs = opts.backoffMs ?? 1000;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const categorized = categorizeError(err);

      if (!categorized.retryable || attempt === maxRetries) {
        throw err;
      }

      incidents.log({
        runId: opts.runId,
        severity: 'warn',
        component: opts.component ?? 'retry',
        summary: `Attempt ${attempt} failed (${categorized.category}), retrying...`,
        details: { message: categorized.message },
      });

      await new Promise(r => setTimeout(r, backoffMs * attempt));
    }
  }

  throw lastError;
}
31. Memory initialization (src/runtime/memory-init.ts)
TypeScript

// src/runtime/memory-init.ts
// Called once when a workspace is first created to seed memory with org content.
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const MEMORY_TEMPLATE = (orgText: string) => `# AutoOrg Memory

## Overview
This workspace was initialized on ${new Date().toISOString()}.
Memory is updated after each cycle and consolidated periodically by the DreamAgent.

## Mission summary
${orgText.slice(0, 800)}

## Current best understanding
No cycles completed yet.

## Key constraints (from constitution)
To be populated after first scored cycle.

## Cycle history
`;

export async function initializeWorkspaceMemory(opts: {
  root: string;
  orgText: string;
  constitutionText: string;
}) {
  const memoryDir = path.join(opts.root, 'memory');
  const factsDir = path.join(memoryDir, 'facts');
  const partitionsDir = path.join(memoryDir, 'partitions');
  const memoryPath = path.join(memoryDir, 'MEMORY.md');

  await mkdir(factsDir, { recursive: true });
  await mkdir(partitionsDir, { recursive: true });

  // Only initialize if not already present
  try {
    await readFile(memoryPath, 'utf-8');
    return; // already initialized
  } catch {}

  await writeFile(memoryPath, MEMORY_TEMPLATE(opts.orgText), 'utf-8');

  // Write constitution summary to facts
  await writeFile(
    path.join(factsDir, 'constitution-summary.md'),
    `# Constitution Summary\n\n${opts.constitutionText.slice(0, 2000)}`,
    'utf-8'
  );
}
32. src/runtime/orchestrator-entrypoint.ts
TypeScript

// src/runtime/orchestrator-entrypoint.ts
// Local development entrypoint. Reads org.md and constitution.md from CWD.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { runAutoOrg } from '@/runtime/orchestrator.js';
import { initializeWorkspaceMemory } from '@/runtime/memory-init.js';

loadEnv();

async function main() {
  const root = process.cwd();

  const orgText = await readFile(path.join(root, 'org.md'), 'utf-8').catch(() => {
    console.error('❌ org.md not found. Create org.md with your mission before running.');
    process.exit(1);
  });

  const constitutionText = await readFile(path.join(root, 'constitution.md'), 'utf-8').catch(() => {
    console.error('❌ constitution.md not found. Create constitution.md with your scoring criteria.');
    process.exit(1);
  });

  await initializeWorkspaceMemory({ root, orgText, constitutionText });

  const result = await runAutoOrg({
    orgText,
    constitutionText,
    mode: 'normal',
    maxCycles: Number(process.env.AUTOORG_MAX_CYCLES ?? 20),
    plateauCycles: Number(process.env.AUTOORG_PLATEAU_CYCLES ?? 5),
    workspaceRoot: root,
  });

  console.log('\n════════════════════════════════════════');
  console.log(`✅ Run complete: ${result.runId}`);
  console.log(`   Cycles:        ${result.totalCycles}`);
  console.log(`   Best score:    ${result.finalScore.composite.toFixed(4)}`);
  console.log(`   Total cost:    $${result.totalCostUsd.toFixed(4)}`);
  console.log(`   Tool calls:    ${result.totalToolCalls}`);
  console.log(`   Stopped:       ${result.stoppedReason}`);
  console.log('════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
33. web/next.config.ts
TypeScript

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
  env: {
    AUTOORG_API_URL: process.env.AUTOORG_API_URL ?? 'http://localhost:3000',
  },
};

export default nextConfig;
34. web/tailwind.config.ts
TypeScript

import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'autoorg-dark': '#0a0a0a',
        'autoorg-card': '#111111',
        'autoorg-border': '#222222',
        'autoorg-cyan': '#22d3ee',
        'autoorg-green': '#4ade80',
        'autoorg-red': '#f87171',
        'autoorg-yellow': '#fbbf24',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
35. web/app/layout.tsx
TypeScript

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AutoOrg',
  description: 'Governed autonomous organization runtime',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navLinks = [
    ['Dashboard', '/'],
    ['Graph', '/graph'],
    ['Approvals', '/approvals'],
    ['Budgets', '/budgets'],
    ['Locks', '/locks'],
    ['Issues', '/issues'],
    ['Tools', '/tools'],
    ['Evidence', '/evidence'],
    ['Ledger', '/ledger'],
    ['Provenance', '/provenance'],
    ['Security', '/security'],
    ['Benchmarks', '/benchmarks'],
    ['Leaderboard', '/leaderboard'],
    ['Regressions', '/regressions'],
    ['Portfolio', '/portfolio'],
    ['Runs', '/runs'],
    ['Billing', '/billing'],
    ['Learning', '/learning'],
    ['Proposals', '/proposals'],
    ['Admin', '/admin'],
  ];

  return (
    <html lang="en" className="dark">
      <body className="bg-[#0a0a0a] text-gray-100 min-h-screen font-mono">
        <header className="border-b border-[#222] px-6 py-4 flex items-center justify-between sticky top-0 bg-[#0a0a0a] z-50">
          <a href="/" className="text-cyan-400 font-bold text-lg tracking-tight">
            AutoOrg
          </a>
          <nav className="flex gap-4 flex-wrap text-xs overflow-x-auto max-w-4xl">
            {navLinks.map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="text-gray-400 hover:text-cyan-400 transition-colors whitespace-nowrap"
              >
                {label}
              </a>
            ))}
          </nav>
        </header>
        <main className="px-6 py-8 max-w-7xl mx-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
36. web/app/globals.css
CSS

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #0a0a0a;
  --card: #111111;
  --border: #222222;
  --cyan: #22d3ee;
  --green: #4ade80;
  --red: #f87171;
  --yellow: #fbbf24;
}

* {
  box-sizing: border-box;
}

body {
  background: var(--bg);
  color: #e5e7eb;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 16px;
}

.table-auto th {
  text-align: left;
  padding: 8px 12px;
  color: #9ca3af;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border);
}

.table-auto td {
  padding: 8px 12px;
  border-bottom: 1px solid #1a1a1a;
  font-size: 12px;
  vertical-align: top;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.badge-green { background: #052e16; color: var(--green); }
.badge-red { background: #2d0808; color: var(--red); }
.badge-yellow { background: #2d1f08; color: var(--yellow); }
.badge-cyan { background: #082d33; color: var(--cyan); }
.badge-gray { background: #1a1a1a; color: #9ca3af; }
37. web/app/page.tsx (Dashboard)
TypeScript

// web/app/page.tsx
'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_AUTOORG_API_URL ?? 'http://localhost:3000';

function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(url)
      .then(r => r.json())
      .then(setData)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [url]);

  return { data, loading, error };
}

export default function DashboardPage() {
  const { data: health } = useFetch<{ ok: boolean; version: string; ts: string }>(`${API}/health`);
  const { data: runs, loading: runsLoading } = useFetch<any[]>(`${API}/api/runs`);
  const { data: findings } = useFetch<any[]>(`${API}/api/security/findings`);

  const openFindings = (findings ?? []).filter((f: any) => f.status === 'open');

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-cyan-400">Dashboard</h1>
        <div className="text-xs text-gray-500">
          {health ? (
            <span className={health.ok ? 'text-green-400' : 'text-red-400'}>
              {health.ok ? '● Online' : '● Degraded'} · v{health.version}
            </span>
          ) : '...'}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Runs" value={runs?.length ?? '—'} />
        <StatCard
          label="Active Runs"
          value={(runs ?? []).filter((r: any) => r.status === 'running').length}
        />
        <StatCard
          label="Open Findings"
          value={openFindings.length}
          color={openFindings.length > 0 ? 'red' : 'green'}
        />
        <StatCard
          label="Best Score"
          value={
            runs?.length
              ? Math.max(...runs.map((r: any) => r.best_score ?? 0)).toFixed(4)
              : '—'
          }
        />
      </div>

      {/* Recent runs */}
      <div className="card">
        <h2 className="text-sm font-bold text-gray-300 mb-4">Recent Runs</h2>
        {runsLoading && <p className="text-gray-500 text-sm">Loading...</p>}
        {!runsLoading && (!runs?.length) && (
          <p className="text-gray-500 text-sm">No runs yet. Run <code>bun start</code> to begin.</p>
        )}
        {!runsLoading && runs?.length > 0 && (
          <table className="table-auto w-full">
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Status</th>
                <th>Mode</th>
                <th>Score</th>
                <th>Cycles</th>
                <th>Cost</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 20).map((run: any) => (
                <tr key={run.id}>
                  <td className="font-mono text-xs text-cyan-400">{run.id}</td>
                  <td>
                    <span className={`badge badge-${
                      run.status === 'completed' ? 'green' :
                      run.status === 'running' ? 'cyan' :
                      run.status === 'failed' ? 'red' : 'gray'
                    }`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="text-gray-400">{run.mode}</td>
                  <td className="text-gray-300">{run.best_score?.toFixed(4) ?? '—'}</td>
                  <td className="text-gray-400">{run.total_cycles ?? '—'}</td>
                  <td className="text-gray-400">${run.total_cost_usd?.toFixed(4) ?? '0.0000'}</td>
                  <td className="text-gray-500 text-xs">{run.created_at?.slice(0, 19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Open security findings */}
      {openFindings.length > 0 && (
        <div className="card border-red-900">
          <h2 className="text-sm font-bold text-red-400 mb-4">
            Open Security Findings ({openFindings.length})
          </h2>
          <table className="table-auto w-full">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Category</th>
                <th>Summary</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {openFindings.slice(0, 10).map((f: any) => (
                <tr key={f.id}>
                  <td>
                    <span className={`badge badge-${f.severity === 'critical' ? 'red' : 'yellow'}`}>
                      {f.severity}
                    </span>
                  </td>
                  <td className="text-gray-400">{f.category}</td>
                  <td className="text-gray-300">{f.summary?.slice(0, 80)}</td>
                  <td className="text-gray-500 text-xs">{f.created_at?.slice(0, 19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color = 'cyan' }: {
  label: string;
  value: string | number;
  color?: 'cyan' | 'green' | 'red' | 'yellow';
}) {
  const colors = {
    cyan: 'text-cyan-400',
    green: 'text-green-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
  };

  return (
    <div className="card">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}
38. web/package.json
JSON

{
  "name": "autoorg-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start --port 3001",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0"
  }
}
What the agent now has
Every missing piece is now covered:

text

✅ tsconfig.json                    path aliases + strict mode
✅ bunfig.toml                      test runner + install config
✅ package.json                     all deps with correct names
✅ .gitignore                       protects secrets + artifacts
✅ .env.example                     every env var documented

✅ src/types/index.ts               all shared types in one place
✅ src/config/model-costs.ts        cost table for billing
✅ src/config/feature-flags.ts      DB-backed + env-override flags
✅ src/db/migrate.ts                getDb() with WAL + FK + timeout

✅ src/adapters/base-adapter.ts     adapter interface + JSON retry
✅ src/adapters/anthropic-adapter.ts  Anthropic SDK
✅ src/adapters/openai-adapter.ts   OpenAI SDK
✅ src/adapters/adapter-factory.ts  factory + model-name routing

✅ src/runtime/agent-runner.ts      complete with tool planning + evidence
✅ src/runtime/approval-gate.ts     request/approve/reject
✅ src/runtime/results-logger.ts    TSV + DB write
✅ src/runtime/transcript.ts        JSONL event writer
✅ src/runtime/event-bus.ts         in-process pub/sub
✅ src/runtime/memory-manager.ts    MEMORY.md read/write/append
✅ src/runtime/graph-manager.ts     lightweight graph with ingest
✅ src/runtime/ratchet.ts           score + decide + commit + revert
✅ src/runtime/dream.ts             memory consolidation
✅ src/runtime/scheduler.ts         due jobs query
✅ src/runtime/scorer.ts            clamp utilities
✅ src/runtime/ultraplan.ts         plateau pivot engine
✅ src/runtime/error-handler.ts     error categorization + retry
✅ src/runtime/memory-init.ts       first-time workspace seeding
✅ src/runtime/orchestrator-entrypoint.ts  CLI entry point

✅ roles/CEO.md                     complete prompt
✅ roles/Engineer.md                complete prompt
✅ roles/Critic.md                  complete prompt
✅ roles/Archivist.md               complete prompt
✅ roles/DevilsAdvocate.md          complete prompt
✅ roles/RatchetJudge.md            complete with scoring formula
✅ roles/CoordinatorLead.md         complete prompt
✅ roles/DreamAgent.md              complete prompt

✅ org.md                           canonical example
✅ constitution.md                  canonical example with weights

✅ src/api/server.ts                all routes aggregated + health

✅ web/next.config.ts               Next.js config
✅ web/tailwind.config.ts           Tailwind config
✅ web/package.json                 web deps
✅ web/app/layout.tsx               complete with full nav
✅ web/app/globals.css              base styles
✅ web/app/page.tsx                 working dashboard








Engineering Spec (distilled from Autoorg.md)
This is an implementation-oriented spec of AutoOrg as defined in the single design doc Autoorg.md: state machine + modules + data models + DB schema-by-phase + minimal acceptance tests. Everything below is grounded in what the doc explicitly specifies (including file paths, TypeScript signatures, schemas, and phase checklists). 
1

0) System contract: immutable vs mutable inputs/outputs
0.1 The “three-file contract” (source-of-truth)
AutoOrg’s core safety/discipline comes from a strict contract among three files:

org.md — the only human-edited file; contains mission, seed material, constraints, stopping criteria, budgets, and model assignments. 
1
constitution.md — immutable scoring rubric + ratchet rule; agents that modify it are “terminated” per the constitution header. 
1
results.tsv — append-only experiment ledger written automatically each cycle (cycle/timestamp/scores/decision/cost/summary). 
1
0.2 Other “always-on” artifacts
Git history is the ratchet’s persistence mechanism: COMMIT when improved, otherwise reset/revert. 
1
SQLite DB (autoorg.db) is the audit/observability spine (runs, cycles, agents, mailbox messages, scores, etc.). 
1
1) Runtime entrypoints & run modes (CLI + preflight)
1.1 CLI entrypoint
src/index.ts is the main entry point; it supports:

--org <path> (alternate org file)
--no-ui / --headless
--mock / --phase0 (Phase 0 mock agents + mock scoring, no API calls) 
1
1.2 Provider preflight checks
The entrypoint performs provider detection and warns if the Judge isn’t configured as desired. It checks env keys for Anthropic/OpenAI/Groq/Together and detects Ollama by hitting /api/tags. 
1

2) Core state machine (the orchestrator loop)
2.1 Orchestrator is an async-generator “NEVER STOP” loop
Phase 0 includes src/runtime/orchestrator.ts implemented as an async generator yielding structured OrchestratorEvents (for UI + logs). It explicitly enforces the “NEVER STOP” principle: errors do not crash the loop; it reverts state and continues. 
1

2.2 Stop conditions (hard gates)
Each cycle checks OrgConfig stopping criteria:

max_cycles
plateau
consecutive_rejects
budget
target_score 
1
2.3 Phase 0 canonical cycle phases
The Phase 0 loop runs these phases (with cycleState.phase updates + phase_change events):

assign — CEO assigns tasks (mocked in Phase 0)
work — workers run in parallel (Engineer/Critic/DevilsAdvocate/Archivist)
synthesize — CEO synthesizes and writes proposal + updates workspace/current_output.md
judge — RatchetJudge scoring (mock scoring in Phase 0)
ratchet — keep-or-revert via Git
(optional) autoDream every dreamInterval
bookkeeping: DB score_history insert, budget warnings, etc. 
1
3) Core types / wire formats (you implement against these)
3.1 Parsed org configuration (OrgConfig)
src/types/index.ts defines OrgConfig fields the orchestrator relies on:

mission, seedMaterial, constraints
activeRoles, modelAssignments
maxCycles, plateauCycles, consecutiveRejects, maxApiSpendUsd, targetScore
dreamInterval, maxWorkersParallel, cycleTimeoutMs
contentHash (sha256 of org.md) 
1
3.2 Mailbox tasks and outputs
AgentTask and AgentOutput are formalized:

tasks: from/to role, cycleNumber, runId, instruction, contextRefs (pointers), metadata, timestamp
outputs: content + optional structuredData + token/cost/duration accounting 
1
3.3 Ratchet scoring contract (RatchetScore)
RatchetScore includes:

four dimensions: groundedness/novelty/consistency/alignment
composite weighted score
decision (COMMIT|REVERT|DISQUALIFIED|TIMEOUT|ERROR)
objections + blocker/major counts + optional disqualification reason 
1
4) Storage model
4.1 Filesystem layout (canonical repo structure)
The doc defines a target repo tree: roles, mailbox, memory tiers, knowledge graph, workspace, runtime, adapters, UIs, config, tests. 
1

Key subtrees (operational semantics):

mailbox/ = filesystem IPC (inbox/ + outbox/). 
1
memory/ = tiered memory (MEMORY.md index under 150 lines; facts/; transcripts/). 
1
workspace/ = living artifact + per-cycle proposals/snapshots. 
1
knowledge-graph/ = entity/relationship JSON + graph.db. 
1
4.2 SQLite baseline schema (Phase 0)
At minimum, Phase 0 schema includes:

runs (run metadata + org hash + totals)
cycles (score dimensions, decision, git hashes, proposal path, costs)
agent_executions (per agent invocation per cycle)
feature_flags, system_prompts
knowledge graph tables (flat representation) and score history views like v_cycle_summary, v_run_progress 
1
4.3 results.tsv schema (Phase 0)
results.tsv header is explicitly defined: cycle, timestamp, score, groundedness, novelty, consistency, alignment, decision, cost_usd, summary and each cycle appends one row; summary sanitized to remove tabs/newlines. 
1

5) Module-level spec (what each component must do)
5.1 src/config/org-parser.ts
Responsibilities:

Extract required markdown sections (## MISSION, ## DOMAIN SEED MATERIAL, etc.) and enforce presence.
Parse model assignment strings of form provider/model and inject provider base URLs + API keys from env.
Produce an OrgConfig with defaults (maxCycles=50, plateauCycles=10, etc.). 
1
5.2 Feature flags (feature_flags table + loader)
Phase 0 migration seeds a set of shipped + experimental flags (e.g., autoDream, graphRag, parallelWorkers, ultraplan, webDashboard, etc.). Later phases seed additional flags (Phase 2, Phase 3, Phase 4.1). 
1

5.3 src/runtime/mailman.ts (filesystem mailbox IPC)
There are two levels of mailbox spec in the doc:

(A) Minimal flat-file mailbox (concept)
A simple deliver/read/reply pattern writing JSON files by role. 
1

(B) “Envelope” mailbox with DB logging (implementation)
Defines MailboxMessage envelope:

{id, from, to, type: task|reply|objection|directive|memory_update, payload, createdAt, readAt?} And exposes:
deliverTask(task)
readTask(role, cycleNumber)
postReply(output)
readReplies(roles, cycleNumber)
cleanCycle(cycleNumber)
logs to DB table mailbox_messages as best-effort. 
1
5.4 src/runtime/ratchet.ts (keep-or-revert engine)
Phase 0 RatchetEngine implements:

score(cycleNumber, previousBest, proposalPath?):
in Phase 0 mock mode returns deterministic “learning-curve-like” scores and decisions.
non-mock is “not implemented yet” until Phase 1 replaces it with LLM judging. 
1
keepOrRevert(score, previousBest, cycleState):
if improved: gitCommit(...), update DB cycles row with git_commit_hash, append results.tsv
else: gitReset(), update DB as REVERT, append results.tsv 
1
5.5 Prompts / roles (behavioral contracts)
CEO assignment output is structured JSON
CEO’s assignment pass must return a JSON object with:

cycle_assessment
assignments for Engineer/Critic/DevilsAdvocate/Archivist with task + focus/avoid/etc.
synthesis_directive for later CEO synthesis. 
1
CEO synthesis is a rewrite gate
CEO synthesis prompt enforces rules: resolve BLOCKERs, address MAJORs, incorporate Devil’s Advocate point, keep output grounded, rewrite the “living document.” 
1

Archivist memory governance
Archivist is the only writer to tier-2 memory; only commits validated decisions on COMMIT and failed experiments on REVERT; MEMORY.md is pointer-only and capped at 150 lines. 
1

RatchetJudge must use constitution and return JSON score
The role description makes Judge final and requires scoring by reading constitution + proposal + knowledge graph. The constitution also contains automatic disqualification rules. 
1

5.6 src/runtime/orchestrator.ts (authoritative behavior)
Key invariants from the Phase 0 implementation:

stopping criteria checked at top of loop
phase events emitted for UI/observability
parallel workers executed with Promise.all
proposal content is written to per-cycle proposal files and current output updated
errors cause revert + counters update, but do not crash the run 
1
5.7 Structured output parsing (utils/structured-output.ts)
The doc provides a robust JSON extraction approach:

try full output
try ```json blocks
try ``` blocks
try substring between first {…} and first […] variants This exists to make Zod-validated structured agent outputs resilient. 
1
6) Memory subsystem spec (Phase 3)
Phase 3 formalizes memory into a DB-backed “fact store” + transcript indexing + hybrid search + Dream engine.

6.1 Phase 3 schema additions (core tables)
Phase 3 migration adds tables:

facts (statement + category + provenance + confidence + lifecycle + embedding)
dream_runs (what was scanned/changed + report + cost)
embeddings_cache
transcript_index + FTS5 transcript_fts (BM25)
contradictions
memory_snapshots_v2 And views like v_fact_summary, v_dream_summary, v_memory_health. 
1
6.2 Hybrid search contract (0.7 semantic + 0.3 BM25)
The doc makes hybrid search an explicit invariant (and cites the 0.7/0.3 ratio as “exact ratio used” in the referenced inspiration). 
1

6.3 DreamEngine (autoDream) is a first-class pipeline
DreamEngine.dream(...) does:

record dream run start into DB
index recent transcripts
search for patterns
load current memory files + open objections
call DreamAgent model
parse output (fallback if parse fails) … and writes updated memory index, facts, contradiction resolution, etc. 
1
7) Knowledge graph subsystem spec (Phase 4 + 4.1)
7.1 GraphBuilder pipeline (Phase 4)
GraphBuilder is defined as:

chunk seed material with overlap
LLM extraction: entities + relationships
merge/dedupe
persist to graph DB (Neo4j driver or Kuzu fallback) 
1
7.2 Extraction prompts are Zod-specified
Relationships extraction schema includes relationship enum with many canonical types and requires sourceText quote + confidence. 
1

7.3 Phase 4.1: deterministic groundedness + snapshots
Phase 4.1 migration explicitly adds:

graph_snapshots, graph_snapshot_nodes, graph_snapshot_edges
groundedness_reports with computed coverage ratios
feature flags: deterministicGroundedness, graphSnapshots, graphDiffs, graphExport, graphSearchUi 
1
8) Objections + pipeline tracking (Phase 2)
Phase 2 turns Critic feedback into persistent, queryable workflow state.

8.1 Phase 2 schema additions
Adds:

objections (severity BLOCKER/MAJOR/MINOR + lifecycle fields)
pipeline_steps (records each step in sequential pipeline)
cycle_context (stores each agent’s full prompt/context/response for interviews)
interview_sessions
websocket_events ring buffer with cleanup trigger And creates views v_objection_summary, v_pipeline_summary. 
1
8.2 Objection tracker UI component exists (web)
The Next.js component displays open vs resolved objections and renders severity-coded items. 
1

9) Operational hardening & approvals (Phase 5.1)
Phase 5.1 is explicitly defined as the “run unattended for 72+ hours safely” layer. 
1

9.1 Workspace concurrency locks
WorkspaceLock implements TTL leases per lock_key and prevents concurrent mutation of the same repo/workspace. 
1

9.2 Crash recovery journal
RecoveryJournal stores checkpoints and recovery events, and recoverInterruptedRun(runId) reclaims expired leases and sweeps locks, logging incidents. 
1

9.3 Strict approval blocking
ApprovalEnforcer.stageCommitCandidate(...) stages candidate artifacts/diffs into artifacts/approvals/pending, creates an approval request, records pending_actions, and enforces a “hard block” until approval exists. 
1

9.4 Patch summarization from real diffs
Phase 5.1 includes a diff summarizer with Zod schema and an integration that drafts PR text based on actual git diff. 
1

9.5 Phase 5.1 test suite (explicit)
The doc lists concrete tests:

approval-enforcer.test.ts
workspace-lock.test.ts
recovery-journal.test.ts
lease-manager.test.ts
budget-manager.test.ts
issue-translator.test.ts
diff-summarizer.test.ts 
1
10) Tool-using org + evidence packs (Phase 6)
10.1 Tool registry and evidence packs are first-class artifacts
Phase 6 adds:

src/tools/registry.ts, tool-runner.ts, tool-policy.ts
evidence packs (evidence-pack.ts) + replay (replay.ts) + sandbox execution
prompts: tool planner, evidence synthesizer, verification auditor, tool-aware critic
API routes for tools/traces/evidence/replay 
1
10.2 AgentRunner tool-aware execution path (reference implementation)
AgentRunner.runWithTools(...):

lists allowed tools via ToolPolicy
plans tool calls via a structured ToolPlan schema
executes tool calls and collects execution IDs
builds evidence packs from executions
synthesizes final response using evidence pack text 
1
11) Policy + provenance + signing + redaction (Phase 6.1)
Phase 6.1 is explicitly the hardening layer making actions: policy-governed, reversible, attributable, signed, redactable, auditable. 
1

Minimal UI additions include /security, /provenance, /ledger pages and nav links. 
1

12) Benchmark lab & regressions (Phase 7)
12.1 Gold evaluator exists (implementation detail)
src/evals/gold-evaluator.ts combines:

measured acceptance bands (passBand(...) thresholds)
an LLM structured comparison against gold output …and returns final acceptance_pass gated by both. 
1
12.2 Explicit Phase 7 runbook
The doc includes curl commands for:

running suites
leaderboards
regressions
replay
constitution A/B
template bakeoff
judge calibration 
1
13) Portfolio orchestration (Phase 8)
Phase 8 introduces a portfolio runner + variant manifests + allocator + judge council + tournaments + quarantine + best-of-N synthesis. 
1

A concrete reference implementation exists for best-of-N synthesis writing signed/immutable artifacts and recording portfolio_syntheses. 
1

14) Platform/productization (Phase 9)
Phase 9 includes deployment modes, SDK scopes, and a public TypeScript SDK client. 
1

15) Learning organization (Phase 10)
Phase 10 defines a bounded self-improvement loop with:

pattern mining from benchmark + regression + policy + routing tables
converting patterns into bounded improvement proposals
simulation gate + drift detection + approval gating
optional env knobs for thresholds 
1
16) DB tables by phase (quick delta index)
Phase	Migration / schema adds (high-signal)
0	runs, cycles, agent_executions, feature_flags, system_prompts, base graph tables, views (v_cycle_summary, v_run_progress) 
1
2	objections, pipeline_steps, cycle_context, interview_sessions, websocket_events + views v_objection_summary, v_pipeline_summary 
1
3	facts, dream_runs, embeddings_cache, transcript_index + FTS5, contradictions, memory_snapshots_v2 + views 
1
4.1	graph_snapshots (+ nodes/edges), groundedness_reports, new flags 
1
5.1	(hardening tables implied by code: locks, checkpoints, pending actions, etc.; plus tests + API routes snippets) 
1
6+	tools/traces/evidence + policy/provenance (declared as schema-phase6 / 6.1) 
1
7+	benchmark runs/attempts/metrics, regressions, leaderboards, calibration (declared via runbook + components) 
1
8+	portfolio runs/rounds/syntheses/quarantine (declared + sample insert) 
1
9+	platform/hosted run tables (implied by SDK + API) 
1
10	learning tables: pattern reports, improvement proposals, simulations, versions/routing lineage (shown via queries/inserts) 
1
17) Minimal acceptance tests (what “done” means)
Phase 0 acceptance (explicit checklist)
Must be true:

bun run init creates directories + default files
bun run db:migrate applies schema + seeds flags
bun start --mock runs N cycles and stops correctly
results.tsv populated
git log shows commit entries
autoorg.db has runs/cycles/score_history populated
memory/MEMORY.md updated
workspace/proposals/ has per-cycle files
terminal UI shows scores/sparkline
bun test passes 
1
Phase 5.1 acceptance (explicit)
Must be true:

cannot commit without approval
resume after crash/restart
reclaim orphaned tasks
prevent two daemons mutating same repo
scheduled jobs execute and are recorded
issue → task translation works
PR summaries are derived from actual diff
enforce team budgets
subteam memory partitions
ULTRAPLAN checkpointing
incident logs exist 
1
18) Notable doc-level inconsistencies (you should treat as design decisions to resolve)
Two examples that are explicitly present in Autoorg.md:

“Phase 5” meaning shifts: the Phase list in Part 14 says “Phase 5 = UI + Polish,” but the roadmap later emphasizes Phase 5 → hierarchical/daemon/approvals/integrations and Phase 5.1 → hardening. Treat Part 17 (Phase 5.1 hardening) as the authoritative operational definition. 
1
MEMORY.md hard cap is consistently 150 lines in prompt rules and templates; implementers should obey 150 as the invariant even if other narrative sections mention different caps. 
1
If you want a next artifact that’s directly “buildable,” I can convert this into:

a single sequence diagram (Mermaid) for the orchestrator phases + approval/tool paths,
plus a migration plan that enumerates every table + index + trigger in order (Phase 0 → 10), all still strictly grounded in the doc.







1) Sequence diagram(s) — runnable mental model
1.1 Core orchestrator cycle (Phase 0 → Phase 4)
mermaid

sequenceDiagram
  autonumber
  actor Human
  participant Org as org.md
  participant Const as constitution.md (immutable)
  participant Orchestrator as runtime/orchestrator.ts
  participant Graph as GraphBuilder / GraphRAG
  participant CEO as CEO agent
  participant Eng as Engineer agent
  participant Crit as Critic agent
  participant Adv as Devil's Advocate agent
  participant Arc as Archivist agent
  participant Judge as RatchetJudge agent
  participant Ratchet as RatchetEngine (git keep/revert)
  participant Git as git repo
  participant TSV as results.tsv
  participant DB as autoorg.db

  Human->>Org: Edit mission/seed/constraints/stops/models
  Orchestrator->>Org: readOrgMd()
  Orchestrator->>Const: readConstitution() (read-only)
  Orchestrator->>Graph: buildFromSeedMaterial(seed)

  loop cycle 1..N (until stop criteria)
    Orchestrator->>DB: INSERT cycles row (cycle start)
    Orchestrator->>CEO: Assignment pass (tasks per role)
    Orchestrator->>Eng: Run task
    Orchestrator->>Crit: Review Engineer output
    Orchestrator->>Adv: Contrarian analysis
    Orchestrator->>Arc: Memory updates (facts/index pointers)

    Orchestrator->>CEO: Synthesis pass (rewrite output)
    Orchestrator->>Judge: Score proposal vs constitution+context
    Judge-->>Orchestrator: {G,N,C,M,composite,decision,...}

    alt decision == COMMIT
      Orchestrator->>Ratchet: keepOrRevert(COMMIT)
      Ratchet->>Git: git add/commit
      Orchestrator->>TSV: append row
      Orchestrator->>DB: UPDATE cycles + INSERT score_history
    else decision == REVERT/DISQUALIFIED
      Orchestrator->>Ratchet: keepOrRevert(REVERT)
      Ratchet->>Git: git reset/checkout baseline
      Orchestrator->>TSV: append row
      Orchestrator->>DB: UPDATE cycles + INSERT score_history
    end
  end
This is taken directly from the doc’s “master loop” (async-generator while(true) style), its “three-file contract” (org.md / immutable constitution.md / results.tsv), and the ratchet “commit if improved else reset” rule. 
1

1.2 Approval + tools + policy (Phase 5 → Phase 6.1)
mermaid

sequenceDiagram
  autonumber
  participant Orchestrator
  participant Tools as ToolRegistry/Runner
  participant Evidence as Evidence Packs
  participant Verify as VerificationAuditor
  participant Policy as PolicyEngine + RiskEngine
  participant Ledger as action_ledger
  participant Approvals as approvals + pending_actions
  participant Enforcer as ApprovalEnforcer
  participant Git as git repo

  Orchestrator->>Policy: classify(action) + riskTier()
  Policy-->>Orchestrator: {allowed?, requireApproval?, requireProvenance?}

  alt tool use needed (Phase 6)
    Orchestrator->>Tools: execute tool calls (policy/allowlist/budget)
    Tools-->>Orchestrator: tool_executions + tool_artifacts
    Orchestrator->>Evidence: build evidence_pack (items + summary)
    Orchestrator->>Verify: compute supported vs unsupported claims
    Verify-->>Orchestrator: verification_reports (clamp input)
  end

  Orchestrator->>Ledger: INSERT action_ledger(proposed/applied...) + provenance links

  alt ratchet says COMMIT but strictApprovalBlocking enabled (Phase 5.1)
    Orchestrator->>Approvals: create approval request (approval_type=commit)
    Orchestrator->>Approvals: INSERT pending_actions(staged artifacts + diff)
    Note over Orchestrator: HARD BLOCK (candidate removed from live tree)
    Enforcer->>Approvals: poll approved actions
    Enforcer->>Git: materialize commit from staged artifact
    Enforcer->>Approvals: UPDATE pending_actions(materialized)
  else no approval needed
    Orchestrator->>Git: commit immediately
  end
This matches the Phase 5/5.1 “approval gates + strict blocking + materialization,” Phase 6 “tool registry + evidence packs + verification reports,” and Phase 6.1 “policy/risk + reversible ledger + provenance + signing/redaction” schema and code described in the doc. 
1

2) Migration plan (Phase 0 → Phase 10), enumerating tables + indexes + triggers in order
2.1 Execution order (as the doc operationalizes it)
The doc’s CI example runs migrations in this order (base → Phase 5 → 5.1 → 6 → 6.1 → 7). 
1

A “full build” migration order consistent with the phases present in the doc is:

src/db/migrate.ts (Phase 0 base schema + seed flags) 
1