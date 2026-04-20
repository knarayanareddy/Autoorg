TypeScript

/**
 * AutoOrg — Cycle Context Builder
 *
 * Builds the rich, structured context that each agent receives.
 * Every agent sees a different slice of truth:
 *   - CEO (assign): full overview, memory, failed experiments
 *   - Engineer: task + current output + seed material grounding
 *   - Critic: engineer output + standing objections + constitution excerpt
 *   - Advocate: engineer + critic + contrarian brief
 *   - Archivist: transcripts + memory facts only (no current proposal)
 *   - CEO (synthesis): all worker outputs + directive
 *   - Judge: proposal + objections + constitution + seed material
 *
 * Also stores context to DB for post-run agent interviews.
 */

import { readFile }     from 'node:fs/promises';
import { existsSync }   from 'node:fs';
import { createHash }   from 'node:crypto';
import { getDb }        from '@/db/migrate.js';
import { nanoid }       from 'nanoid';
import type { OrgConfig, AgentRole } from '@/types/index.js';
import type { ObjectionTracker, Objection } from './objection-tracker.js';

interface AgentContext {
  systemPrompt: string;
  userMessage:  string;
}

// ── Context storage ────────────────────────────────────────────────────
export function storeCycleContext(
  cycleId:   string,
  runId:     string,
  role:      AgentRole,
  context:   AgentContext,
  response:  string
): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO cycle_context
      (id, cycle_id, run_id, agent_role, system_prompt, user_message, response)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(nanoid(8), cycleId, runId, role, context.systemPrompt, context.userMessage, response);
  db.close();
}

export function loadCycleContext(cycleId: string, role: AgentRole): AgentContext & { response: string } | null {
  const db  = getDb();
  const row = db.prepare(`
    SELECT system_prompt, user_message, response
    FROM cycle_context WHERE cycle_id = ? AND agent_role = ?
  `).get(cycleId, role) as { system_prompt: string; user_message: string; response: string } | undefined;
  db.close();

  if (!row) return null;
  return {
    systemPrompt: row.system_prompt,
    userMessage:  row.user_message,
    response:     row.response,
  };
}

// ── Safe file loader ───────────────────────────────────────────────────
async function safeRead(filePath: string, maxChars = 3000): Promise<string> {
  if (!existsSync(filePath)) return `[File not found: ${filePath}]`;
  const content = await readFile(filePath, 'utf-8');
  return content.slice(0, maxChars) + (content.length > maxChars ? '\n\n[... truncated ...]' : '');
}

// ── Build agent-specific context objects ──────────────────────────────
export class CycleContextBuilder {
  private config:     OrgConfig;
  private cycle:      number;
  private bestScore:  number;
  private maxCycles:  number;
  private objections: ObjectionTracker;

  constructor(
    config:    OrgConfig,
    cycle:     number,
    bestScore: number,
    objections: ObjectionTracker
  ) {
    this.config     = config;
    this.cycle      = cycle;
    this.bestScore  = bestScore;
    this.maxCycles  = config.maxCycles;
    this.objections = objections;
  }

  // ── Shared header all agents see ──────────────────────────────────
  private async sharedHeader(): Promise<string> {
    const memoryIndex    = await safeRead('./memory/MEMORY.md', 2000);
    const currentOutput  = await safeRead('./workspace/current_output.md', 2500);

    return `
## ORGANIZATIONAL CONTEXT
**Organization:** AutoOrg
**Mission:** ${this.config.mission}
**Cycle:** ${this.cycle} / ${this.maxCycles}
**Best score:** ${this.bestScore.toFixed(4)} / 1.0
**Target score:** ${this.config.targetScore}

## CONSTRAINTS (ABSOLUTE — NEVER VIOLATE)
${this.config.constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## MEMORY INDEX (TIER 1)
${memoryIndex}

## CURRENT OUTPUT DOCUMENT
\`\`\`
${currentOutput}
\`\`\`
`.trim();
  }

  // ── CEO Assignment Context ─────────────────────────────────────────
  async forCEOAssignment(): Promise<string> {
    const shared           = await this.sharedHeader();
    const failedExperiments = await safeRead('./memory/facts/failed_experiments.md', 2000);
    const objectionSummary = this.objections.formatForContext(8);
    const stats            = this.objections.getStats();

    return `
${shared}

## STANDING OBJECTIONS FROM CRITIC
Total: ${stats.total} | Open: ${stats.open} | Resolved: ${stats.resolved}
Open Blockers: ${stats.blockers} | Open Majors: ${stats.majors}

${objectionSummary}

## FAILED EXPERIMENTS (AVOID REPEATING)
${failedExperiments}
`.trim();
  }

  // ── Engineer Context ───────────────────────────────────────────────
  async forEngineer(): Promise<string> {
    const shared           = await this.sharedHeader();
    const validatedDecisions = await safeRead('./memory/facts/validated_decisions.md', 1500);
    const domainKnowledge  = await safeRead('./memory/facts/domain_knowledge.md', 1500);
    const openBlockers     = this.objections.getOpenBlockers();

    return `
${shared}

## VALIDATED DECISIONS (MUST PRESERVE IN YOUR OUTPUT)
${validatedDecisions}

## DOMAIN KNOWLEDGE (GROUNDING FACTS)
${domainKnowledge}

## ACTIVE BLOCKERS (YOUR OUTPUT MUST ADDRESS THESE)
${openBlockers.length === 0
  ? '[No active blockers — write freely]'
  : openBlockers.map(b => `🚨 BLOCKER [${b.id}]: ${b.description}\n   Fix: ${b.proposedFix}`).join('\n\n')
}

## SEED MATERIAL (GROUND EVERY CLAIM IN THIS)
${this.config.seedMaterial.slice(0, 3000)}
`.trim();
  }

  // ── Critic Context (receives Engineer output) ──────────────────────
  async forCritic(engineerOutput: string): Promise<string> {
    const shared        = await this.sharedHeader();
    const constitution  = await safeRead('./constitution.md', 2000);
    const allObjections = this.objections.getAllObjections();

    const previousObjectionSummary = allObjections
      .slice(0, 15)
      .map(o => `[${o.id}] (Cycle ${o.cycleRaised}) ${o.severity}: ${o.description.slice(0, 100)} | ${o.resolved ? '✓ RESOLVED' : '○ OPEN'}`)
      .join('\n');

    return `
${shared}

## CONSTITUTION SCORING DIMENSIONS (what you are checking against)
${constitution}

## COMPLETE OBJECTION HISTORY FOR THIS RUN
${previousObjectionSummary || '[No previous objections]'}

## ENGINEER OUTPUT TO CRITIQUE (THIS CYCLE)
${engineerOutput.slice(0, 4000)}

## SEED MATERIAL (for groundedness verification)
${this.config.seedMaterial.slice(0, 2000)}
`.trim();
  }

  // ── Devil's Advocate Context (receives Engineer AND Critic output) ──
  async forDevilsAdvocate(engineerOutput: string, criticOutput: string): Promise<string> {
    const shared = await this.sharedHeader();

    return `
${shared}

## ENGINEER OUTPUT (what you are responding to)
${engineerOutput.slice(0, 2500)}

## CRITIC OUTPUT (the view you may challenge or extend)
${criticOutput.slice(0, 2000)}

## STANDING OPEN OBJECTIONS
${this.objections.formatForContext(5)}
`.trim();
  }

  // ── Archivist Context (memory-focused — limited proposal access) ───
  async forArchivist(transcriptSummary: string): Promise<string> {
    const failedExperiments  = await safeRead('./memory/facts/failed_experiments.md', 3000);
    const validatedDecisions = await safeRead('./memory/facts/validated_decisions.md', 2000);
    const stats              = this.objections.getStats();

    return `
## ARCHIVIST BRIEF — Cycle ${this.cycle}

**Mission:** ${this.config.mission}
**Cycle:** ${this.cycle} / ${this.maxCycles}
**Best score:** ${this.bestScore.toFixed(4)}

## OBJECTION STATISTICS
Total raised: ${stats.total} | Still open: ${stats.open} | Resolved: ${stats.resolved}
Oldest open objection: Cycle ${stats.oldestOpenCycle ?? 'N/A'}

## FULL FAILED EXPERIMENTS RECORD
${failedExperiments}

## FULL VALIDATED DECISIONS RECORD
${validatedDecisions}

## RECENT TRANSCRIPT EVENTS (TIER 3 — search results)
${transcriptSummary}
`.trim();
  }

  // ── CEO Synthesis Context (all worker outputs) ─────────────────────
  async forCEOSynthesis(
    engineerOutput:   string,
    criticOutput:     string,
    advocateOutput:   string,
    archivistOutput:  string,
    cycleAssessment:  string,
    directive:        string
  ): Promise<string> {
    const openBlockers  = this.objections.getOpenBlockers();
    const openObjections = this.objections.getOpenObjections();

    return `
## CEO SYNTHESIS BRIEF — Cycle ${this.cycle}

**Mission:** ${this.config.mission}
**Current best score:** ${this.bestScore.toFixed(4)}
**Open BLOCKERs:** ${openBlockers.length} (must all be addressed)
**Total open objections:** ${openObjections.length}

## YOUR EARLIER CYCLE ASSESSMENT
${cycleAssessment}

## YOUR SYNTHESIS DIRECTIVE
${directive}

## OPEN BLOCKERS (ALL MUST BE RESOLVED IN SYNTHESIS)
${openBlockers.length === 0
  ? '[None — proceed freely]'
  : openBlockers.map(b => `🚨 [${b.id}]: ${b.description}\n   Fix: ${b.proposedFix}`).join('\n\n')
}

---

## ENGINEER OUTPUT
${engineerOutput.slice(0, 3000)}

---

## CRITIC OUTPUT (with objections)
${criticOutput.slice(0, 2000)}

---

## DEVIL'S ADVOCATE OUTPUT
${advocateOutput.slice(0, 1500)}

---

## ARCHIVIST OUTPUT
${archivistOutput.slice(0, 1500)}
`.trim();
  }

  // ── Ratchet Judge Context ──────────────────────────────────────────
  async forRatchetJudge(proposal: string): Promise<string> {
    const constitution       = await safeRead('./constitution.md');
    const failedExperiments  = await safeRead('./memory/facts/failed_experiments.md', 1500);
    const openBlockers       = this.objections.getOpenBlockers();
    const openMajors         = this.objections.getOpenObjections().filter(o => o.severity === 'MAJOR');

    return `
## RATCHET JUDGE BRIEF — Cycle ${this.cycle}

**Previous best score:** ${this.bestScore.toFixed(4)}
**To COMMIT, this proposal must score:** > ${this.bestScore.toFixed(4)}

## THE CONSTITUTION (your scoring framework)
${constitution}

## STANDING OPEN BLOCKERS (BEFORE THIS PROPOSAL)
${openBlockers.length === 0
  ? '[No open blockers — check if proposal created new ones]'
  : openBlockers.map(b => `🚨 [${b.id}]: ${b.description}`).join('\n')
}

## STANDING OPEN MAJORS
${openMajors.length === 0
  ? '[None]'
  : openMajors.map(m => `⚠ [${m.id}]: ${m.description}`).join('\n')
}

## FAILED EXPERIMENTS (for novelty scoring)
${failedExperiments}

## SEED MATERIAL (for groundedness scoring)
${this.config.seedMaterial.slice(0, 2000)}

## PROPOSAL TO SCORE
${proposal.slice(0, 5000)}
`.trim();
  }
}
FILE 6: src/runtime/pipeline.ts — Sequential Agent Pipeline
TypeScript

/**
 * AutoOrg — Sequential Agent Pipeline
 *
 * Phase 2 upgrade: the agent execution order is now a proper pipeline
 * with each stage feeding into the next.
 *
 * Pipeline order:
 *   1. CEO Assignment (parallel context for all workers)
 *   2. Engineer (drafts content)
 *   3. Critic (reviews Engineer — has full Engineer output)
 *   4. Devil's Advocate (reads both Engineer AND Critic)
 *   5. Archivist (checks memory — independent of proposal)
 *   6. CEO Synthesis (has all four worker outputs)
 *   7. Ratchet Judge (scores synthesis against constitution)
 *
 * Steps 3–5 can partially parallelize:
 *   Critic and Archivist are independent (Critic reads Engineer, Archivist reads memory)
 *   Devil's Advocate NEEDS Critic output → waits for Critic first
 *
 * Execution graph:
 *   CEO-Assign
 *       │
 *       ├─► Engineer ──────────────────────┐
 *       │       │                          │
 *       │   ┌───┴────────────────┐         │
 *       │   Critic           Archivist     │
 *       │   (needs Engineer)  (memory only)│
 *       │       │                          │
 *       │   Devil's Advocate               │
 *       │   (needs Critic+Engineer)        │
 *       │       │                          │
 *       └─► CEO Synthesis ◄────────────────┘
 *               │
 *           Ratchet Judge
 */

import chalk                   from 'chalk';
import { nanoid }              from 'nanoid';
import { getDb }               from '@/db/migrate.js';
import { storeCycleContext }   from './cycle-context-builder.js';
import type { AgentRunnerContext } from './agent-runner.js';
import type { CycleState, AgentOutput, CriticOutput, OrgConfig } from '@/types/index.js';
import type { ObjectionTracker, ObjectionDelta } from './objection-tracker.js';
import { CycleContextBuilder } from './cycle-context-builder.js';
import { memoryManager }       from './memory-manager.js';

export interface PipelineResult {
  ceoAssignment:  AgentOutput;
  engineerOutput: AgentOutput;
  criticOutput:   CriticOutput;
  advocateOutput: AgentOutput;
  archivistOutput: AgentOutput;
  ceoSynthesis:   AgentOutput;
  objectionDelta: ObjectionDelta;
  totalCostUsd:   number;
  totalTokens:    number;
}

// ── Pipeline step tracker ──────────────────────────────────────────────
function recordPipelineStep(
  cycleId:  string,
  runId:    string,
  stepName: string,
  order:    number,
  status:   'completed' | 'failed' | 'skipped',
  durationMs: number,
  errorMsg?: string
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO pipeline_steps
      (id, cycle_id, run_id, step_name, step_order, ended_at, duration_ms, status, error_msg)
    VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
  `).run(nanoid(8), cycleId, runId, stepName, order, durationMs, status, errorMsg ?? null);
  db.close();
}

// ══════════════════════════════════════════════════════════════════════
// THE PIPELINE
// ══════════════════════════════════════════════════════════════════════
export async function runCyclePipeline(
  ctx:              AgentRunnerContext,
  cycleState:       CycleState,
  objectionTracker: ObjectionTracker,
  onEvent: (event: { type: string; [key: string]: unknown }) => void
): Promise<PipelineResult> {

  const {
    runCEOAssignment,
    runEngineer,
    runCritic,
    runDevilsAdvocate,
    runArchivist,
    runCEOSynthesis,
  } = await import('./agent-runner.js');

  const contextBuilder = new CycleContextBuilder(
    ctx.config,
    ctx.cycle,
    ctx.bestScore,
    objectionTracker
  );

  let totalCost   = 0;
  let totalTokens = 0;

  // ── Helper: track step ─────────────────────────────────────────────
  const trackStep = async <T>(
    stepName: string,
    stepOrder: number,
    fn: () => Promise<T>
  ): Promise<T> => {
    const start = Date.now();
    try {
      const result = await fn();
      recordPipelineStep(cycleState.id, ctx.runId, stepName, stepOrder, 'completed', Date.now() - start);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordPipelineStep(cycleState.id, ctx.runId, stepName, stepOrder, 'failed', Date.now() - start, msg);
      throw err;
    }
  };

  // ── Helper: accumulate costs ──────────────────────────────────────
  const accumulate = (output: { costUsd: number; tokensUsed: number }) => {
    totalCost   += output.costUsd;
    totalTokens += output.tokensUsed;
    cycleState.totalCostUsd += output.costUsd;
    cycleState.totalTokens  += output.tokensUsed;
  };

  // ════════════════════════════════════════════════════════════════════
  // STEP 1: CEO ASSIGNMENT
  // ════════════════════════════════════════════════════════════════════
  console.log(chalk.bold.blue(`\n  ┌─ [1/7] CEO Assignment`));
  onEvent({ type: 'phase_change', phase: 'assign' });
  onEvent({ type: 'agent_start', role: 'CEO', model: ctx.config.modelAssignments.CEO?.model ?? 'default' });

  const ceoContext = await contextBuilder.forCEOAssignment();

  const ceoAssignResult = await trackStep('ceo_assign', 1, () =>
    runCEOAssignment(ctx)
  );

  accumulate(ceoAssignResult.output);
  storeCycleContext(cycleState.id, ctx.runId, 'CEO', {
    systemPrompt: '[CEO Assignment System Prompt]',
    userMessage:  ceoContext,
  }, ceoAssignResult.output.content);

  onEvent({ type: 'agent_done', role: 'CEO', costUsd: ceoAssignResult.output.costUsd, tokens: ceoAssignResult.output.tokensUsed });
  console.log(chalk.green(`  │  ✓ CEO assignments ready`));

  // ════════════════════════════════════════════════════════════════════
  // STEP 2: ENGINEER
  // ════════════════════════════════════════════════════════════════════
  console.log(chalk.bold.green(`  ├─ [2/7] Engineer drafting...`));
  onEvent({ type: 'agent_start', role: 'Engineer', model: ctx.config.modelAssignments.Engineer?.model ?? 'default' });

  const engineerOutput = await trackStep('engineer', 2, () =>
    runEngineer(ctx, ceoAssignResult.assignments.Engineer)
  );

  accumulate(engineerOutput);
  storeCycleContext(cycleState.id, ctx.runId, 'Engineer', {
    systemPrompt: '[Engineer System Prompt]',
    userMessage:  await contextBuilder.forEngineer(),
  }, engineerOutput.content);

  onEvent({ type: 'agent_done', role: 'Engineer', costUsd: engineerOutput.costUsd, tokens: engineerOutput.tokensUsed });
  console.log(chalk.green(`  │  ✓ Engineer draft: ${engineerOutput.content.length} chars`));

  // ════════════════════════════════════════════════════════════════════
  // STEP 3: CRITIC + ARCHIVIST (parallel — Critic needs Engineer,
  //         Archivist only needs memory)
  // ════════════════════════════════════════════════════════════════════
  console.log(chalk.bold.red(`  ├─ [3/7] Critic + Archivist (parallel)...`));
  onEvent({ type: 'agent_start', role: 'Critic',    model: ctx.config.modelAssignments.Critic?.model ?? 'default' });
  onEvent({ type: 'agent_start', role: 'Archivist', model: ctx.config.modelAssignments.Archivist?.model ?? 'default' });

  const transcriptSummary = await memoryManager.getRecentTranscriptSummary(5, ctx.cycle);
  const criticContext     = await contextBuilder.forCritic(engineerOutput.content);
  const archivistContext  = await contextBuilder.forArchivist(transcriptSummary);

  // Standing objections formatted for Critic's awareness
  const standingObjectionsText = objectionTracker.formatForContext(10);

  const [criticOutput, archivistOutput] = await Promise.all([
    trackStep('critic', 3, () =>
      runCritic(
        ctx,
        ceoAssignResult.assignments.Critic,
        engineerOutput.content,
        standingObjectionsText
      )
    ),
    trackStep('archivist', 3, () =>
      runArchivist(ctx, ceoAssignResult.assignments.Archivist, transcriptSummary)
    ),
  ]);

  accumulate(criticOutput);
  accumulate(archivistOutput);

  storeCycleContext(cycleState.id, ctx.runId, 'Critic', {
    systemPrompt: '[Critic System Prompt]',
    userMessage:  criticContext,
  }, criticOutput.content);

  storeCycleContext(cycleState.id, ctx.runId, 'Archivist', {
    systemPrompt: '[Archivist System Prompt]',
    userMessage:  archivistContext,
  }, archivistOutput.content);

  onEvent({ type: 'agent_done', role: 'Critic',    costUsd: criticOutput.costUsd,    tokens: criticOutput.tokensUsed });
  onEvent({ type: 'agent_done', role: 'Archivist', costUsd: archivistOutput.costUsd, tokens: archivistOutput.tokensUsed });

  // ── Process Critic output through objection tracker ───────────────
  const rawObjections = criticOutput.structuredData?.objections ?? [];
  const resolvedIds   = criticOutput.structuredData?.resolved_from_previous ?? [];

  const objectionDelta = objectionTracker.processCriticOutput(ctx.cycle, {
    objections:             rawObjections,
    resolved_from_previous: resolvedIds,
  });

  const openBlockers = objectionTracker.getOpenBlockers();
  if (openBlockers.length > 0) {
    console.log(chalk.bold.red(`  │  🚨 ${openBlockers.length} BLOCKER(s) still open — CEO must resolve`));
  }
  console.log(chalk.green(`  │  ✓ Critic: ${rawObjections.length} new objections | ${resolvedIds.length} resolved`));

  // ════════════════════════════════════════════════════════════════════
  // STEP 4: DEVIL'S ADVOCATE (needs Critic output)
  // ════════════════════════════════════════════════════════════════════
  console.log(chalk.bold.magenta(`  ├─ [4/7] Devil's Advocate...`));
  onEvent({ type: 'agent_start', role: 'DevilsAdvocate', model: ctx.config.modelAssignments.DevilsAdvocate?.model ?? 'default' });

  const advocateContext = await contextBuilder.forDevilsAdvocate(
    engineerOutput.content,
    criticOutput.content
  );

  const advocateOutput = await trackStep('devils_advocate', 4, () =>
    runDevilsAdvocate(
      ctx,
      ceoAssignResult.assignments.DevilsAdvocate,
      engineerOutput.content,
      criticOutput.content   // ← Phase 2: Advocate now reads Critic's actual output
    )
  );

  accumulate(advocateOutput);
  storeCycleContext(cycleState.id, ctx.runId, 'DevilsAdvocate', {
    systemPrompt: '[Devil\'s Advocate System Prompt]',
    userMessage:  advocateContext,
  }, advocateOutput.content);

  onEvent({ type: 'agent_done', role: 'DevilsAdvocate', costUsd: advocateOutput.costUsd, tokens: advocateOutput.tokensUsed });
  console.log(chalk.green(`  │  ✓ Devil's Advocate responded`));

  // ════════════════════════════════════════════════════════════════════
  // STEP 5: CEO SYNTHESIS (has all four worker outputs)
  // ════════════════════════════════════════════════════════════════════
  console.log(chalk.bold.blue(`  ├─ [5/7] CEO Synthesis...`));
  onEvent({ type: 'agent_start', role: 'CEO', model: ctx.config.modelAssignments.CEO?.model ?? 'default' });

  const synthContext = await contextBuilder.forCEOSynthesis(
    engineerOutput.content,
    criticOutput.content,
    advocateOutput.content,
    archivistOutput.content,
    ceoAssignResult.cycle_assessment,
    ceoAssignResult.synthesis_directive
  );

  const ceoSynthesis = await trackStep('ceo_synthesis', 5, () =>
    runCEOSynthesis(
      ctx,
      engineerOutput,
      criticOutput,
      advocateOutput,
      archivistOutput,
      ceoAssignResult.cycle_assessment,
      ceoAssignResult.synthesis_directive
    )
  );

  accumulate(ceoSynthesis);
  storeCycleContext(cycleState.id, ctx.runId, 'CEO', {
    systemPrompt: '[CEO Synthesis System Prompt]',
    userMessage:  synthContext,
  }, ceoSynthesis.content);

  onEvent({ type: 'agent_done', role: 'CEO', costUsd: ceoSynthesis.costUsd, tokens: ceoSynthesis.tokensUsed });
  console.log(chalk.green(`  └─ ✓ CEO synthesis: ${ceoSynthesis.content.length} chars\n`));

  return {
    ceoAssignment:   ceoAssignResult.output,
    engineerOutput,
    criticOutput,
    advocateOutput,
    archivistOutput,
    ceoSynthesis,
    objectionDelta,
    totalCostUsd:    totalCost,
    totalTokens,
  };
}
FILE 7: src/runtime/event-bus.ts — WebSocket Event Broadcaster
TypeScript

/**
 * AutoOrg — Event Bus
 *
 * Broadcasts orchestrator events to:
 * 1. Connected WebSocket clients (web dashboard)
 * 2. DB websocket_events table (for replay)
 * 3. Optional SSE endpoint for simpler clients
 *
 * This is the bridge between the orchestrator loop (async generator)
 * and the Next.js dashboard (MiroFish god's-eye view pattern).
 */

import { getDb } from '@/db/migrate.js';
import type { OrchestratorEvent } from '@/types/index.js';

type WebSocketClient = {
  send: (data: string) => void;
  readyState: number;
};

class EventBus {
  private clients:  Set<WebSocketClient> = new Set();
  private runId:    string = '';

  setRunId(runId: string): void {
    this.runId = runId;
  }

  addClient(ws: WebSocketClient): void {
    this.clients.add(ws);
    console.log(`[EventBus] Client connected. Total: ${this.clients.size}`);
  }

  removeClient(ws: WebSocketClient): void {
    this.clients.delete(ws);
    console.log(`[EventBus] Client disconnected. Total: ${this.clients.size}`);
  }

  // ── Broadcast to all connected clients ──────────────────────────────
  broadcast(event: OrchestratorEvent | Record<string, unknown>): void {
    const payload = JSON.stringify({
      ...event,
      ts:     new Date().toISOString(),
      run_id: this.runId,
    });

    // Send to WebSocket clients
    for (const client of this.clients) {
      try {
        if (client.readyState === 1) { // OPEN
          client.send(payload);
        }
      } catch {
        this.clients.delete(client);
      }
    }

    // Persist to DB for dashboard replay
    if (this.runId) {
      try {
        const db = getDb();
        db.prepare(`
          INSERT INTO websocket_events (run_id, event_type, payload)
          VALUES (?, ?, ?)
        `).run(
          this.runId,
          (event as OrchestratorEvent).type ?? 'unknown',
          payload
        );
        db.close();
      } catch {
        // Non-fatal — event bus failure should never crash the orchestrator
      }
    }
  }

  // ── Get recent events for dashboard initial load ───────────────────
  getRecentEvents(runId: string, limit = 100): Array<{
    event_type: string;
    payload: string;
    created_at: string;
  }> {
    try {
      const db   = getDb();
      const rows = db.prepare(`
        SELECT event_type, payload, created_at
        FROM websocket_events
        WHERE run_id = ?
        ORDER BY id DESC
        LIMIT ?
      `).all(runId, limit) as Array<{ event_type: string; payload: string; created_at: string }>;
      db.close();
      return rows.reverse(); // Return chronologically
    } catch {
      return [];
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

// Singleton
export const eventBus = new EventBus();
FILE 8: src/api/server.ts — Bun HTTP + WebSocket API
TypeScript

/**
 * AutoOrg API Server
 * Serves the Next.js dashboard data and WebSocket events.
 *
 * Endpoints:
 *   GET  /api/runs              → all runs
 *   GET  /api/runs/:id          → run detail + summary
 *   GET  /api/runs/:id/cycles   → all cycles for run
 *   GET  /api/runs/:id/cycles/:n → cycle detail + agent executions
 *   GET  /api/runs/:id/objections → all objections
 *   GET  /api/runs/:id/mailbox  → mailbox messages
 *   GET  /api/runs/:id/cost     → cost breakdown by agent
 *   GET  /api/runs/:id/scores   → score history (for chart)
 *   GET  /api/flags             → feature flags
 *   POST /api/interview         → start agent interview session
 *   POST /api/interview/:id     → send a message to an agent
 *   WS   /ws                   → live event stream
 *
 * Run: bun run src/api/server.ts
 */

import { eventBus }      from '@/runtime/event-bus.js';
import { config as dotenvLoad } from 'dotenv';
import {
  getAllRuns, getRun, getCyclesForRun,
  getScoreHistory, getCostBreakdownByRole,
  getOpenObjections, getAllObjections,
  getMailboxForCycle, getAgentExecutionsForCycle,
  getDashboardSummary, getFeatureFlags,
} from '@/db/queries.js';
import chalk from 'chalk';

dotenvLoad();

const PORT = parseInt(process.env.API_PORT ?? '3001');

// ── CORS headers ────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function notFound(msg = 'Not found'): Response {
  return json({ error: msg }, 404);
}

function serverError(msg: string): Response {
  return json({ error: msg }, 500);
}

// ── Route matcher ──────────────────────────────────────────────────────
function matchRoute(
  url: URL,
  method: string,
  pattern: string,
  reqMethod: string
): Record<string, string> | null {
  if (method !== reqMethod && reqMethod !== 'OPTIONS') return null;

  const patternParts = pattern.split('/');
  const urlParts     = url.pathname.split('/');
  if (patternParts.length !== urlParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i]!;
    const u = urlParts[i]!;
    if (p.startsWith(':')) {
      params[p.slice(1)] = u;
    } else if (p !== u) {
      return null;
    }
  }
  return params;
}

// ── Request handler ────────────────────────────────────────────────────
async function handleRequest(req: Request): Promise<Response> {
  const url    = new URL(req.url);
  const method = req.method;

  if (method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    // GET /api/health
    if (url.pathname === '/api/health') {
      return json({
        status:  'ok',
        clients: eventBus.clientCount,
        time:    new Date().toISOString(),
      });
    }

    // GET /api/flags
    if (url.pathname === '/api/flags') {
      return json(getFeatureFlags());
    }

    // GET /api/runs
    if (url.pathname === '/api/runs' && method === 'GET') {
      return json(getAllRuns());
    }

    // GET /api/runs/:id
    let params = matchRoute(url, method, '/api/runs/:id', 'GET');
    if (params) {
      const summary = getDashboardSummary(params.id!);
      return summary ? json(summary) : notFound(`Run ${params.id} not found`);
    }

    // GET /api/runs/:id/scores
    params = matchRoute(url, method, '/api/runs/:id/scores', 'GET');
    if (params) {
      return json(getScoreHistory(params.id!));
    }

    // GET /api/runs/:id/cycles
    params = matchRoute(url, method, '/api/runs/:id/cycles', 'GET');
    if (params) {
      return json(getCyclesForRun(params.id!));
    }

    // GET /api/runs/:id/cost
    params = matchRoute(url, method, '/api/runs/:id/cost', 'GET');
    if (params) {
      return json(getCostBreakdownByRole(params.id!));
    }

    // GET /api/runs/:id/objections
    params = matchRoute(url, method, '/api/runs/:id/objections', 'GET');
    if (params) {
      const openOnly = url.searchParams.get('open') === 'true';
      return json(openOnly ? getOpenObjections(params.id!) : getAllObjections(params.id!));
    }

    // GET /api/runs/:runId/cycles/:cycleId
    params = matchRoute(url, method, '/api/runs/:runId/cycles/:cycleId', 'GET');
    if (params) {
      const executions = getAgentExecutionsForCycle(params.cycleId!);
      const mailbox    = getMailboxForCycle(params.cycleId!);
      return json({ executions, mailbox });
    }

    // GET /api/events/:runId (recent events for dashboard initial load)
    params = matchRoute(url, method, '/api/events/:runId', 'GET');
    if (params) {
      const limit  = parseInt(url.searchParams.get('limit') ?? '100');
      const events = eventBus.getRecentEvents(params.runId!, limit);
      return json(events);
    }

    // POST /api/interview — Start an agent interview
    if (url.pathname === '/api/interview' && method === 'POST') {
      const body = await req.json() as {
        runId:     string;
        agentRole: string;
        cycleId?:  string;
        question:  string;
      };

      const { InterviewEngine } = await import('@/runtime/interview.js');
      const engine   = new InterviewEngine(body.runId);
      const response = await engine.startInterview(body.agentRole, body.cycleId, body.question);

      return json(response);
    }

    // POST /api/interview/:sessionId — Continue an interview
    params = matchRoute(url, method, '/api/interview/:sessionId', 'POST');
    if (params) {
      const body = await req.json() as { message: string };
      const { InterviewEngine } = await import('@/runtime/interview.js');

      // Load session from DB
      const db      = (await import('@/db/migrate.js')).getDb();
      const session = db.prepare(`
        SELECT * FROM interview_sessions WHERE id = ?
      `).get(params.sessionId!) as { run_id: string; turns: string } | undefined;
      db.close();

      if (!session) return notFound(`Session ${params.sessionId} not found`);

      const engine   = new InterviewEngine(session.run_id);
      const response = await engine.continueInterview(params.sessionId!, body.message);

      return json(response);
    }

    return notFound();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`[API] Error: ${msg}`));
    return serverError(msg);
  }
}

// ── Bun server with WebSocket support ─────────────────────────────────
const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    // Upgrade WebSocket connections
    if (req.headers.get('upgrade') === 'websocket') {
      const success = server.upgrade(req);
      return success ? undefined : new Response('WebSocket upgrade failed', { status: 400 });
    }
    return handleRequest(req);
  },
  websocket: {
    open(ws) {
      eventBus.addClient(ws as unknown as { send: (d: string) => void; readyState: number });
      // Send recent events on connect so dashboard catches up
      ws.send(JSON.stringify({ type: 'connected', message: 'AutoOrg API connected' }));
    },
    message(ws, message) {
      // Clients can send { type: 'ping' } or { type: 'subscribe', runId: '...' }
      try {
        const parsed = JSON.parse(String(message)) as { type: string };
        if (parsed.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch { /* ignore malformed messages */ }
    },
    close(ws) {
      eventBus.removeClient(ws as unknown as { send: (d: string) => void; readyState: number });
    },
  },
});

console.log(chalk.bold.cyan(`\n🌐 AutoOrg API Server`));
console.log(chalk.white(`   HTTP:      http://localhost:${PORT}/api`));
console.log(chalk.white(`   WebSocket: ws://localhost:${PORT}/ws`));
console.log(chalk.gray(`   Press Ctrl+C to stop\n`));

export { server };
FILE 9: src/runtime/interview.ts — Agent Interview Engine
TypeScript

/**
 * AutoOrg — Agent Interview Engine
 *
 * Post-run: interrogate any agent about any cycle.
 * The agent is reconstructed from the stored cycle_context in the DB.
 *
 * MiroFish pattern: "You can query individual agents, interrogate the
 * Report Agent for deeper analysis, and inject new variables mid-run."
 *
 * Usage:
 *   const engine = new InterviewEngine(runId);
 *   const { sessionId, response } = await engine.startInterview('Critic', cycleId, 'Why did you raise that blocker?');
 *   const next = await engine.continueInterview(sessionId, 'What would you have done differently?');
 */

import { nanoid }      from 'nanoid';
import { getDb }       from '@/db/migrate.js';
import { getAdapter }  from '@/adapters/adapter-factory.js';
import { loadCycleContext } from './cycle-context-builder.js';
import type { AgentRole, ModelConfig, LLMProvider } from '@/types/index.js';
import chalk from 'chalk';

interface Turn {
  role:    'user' | 'assistant';
  content: string;
}

interface InterviewResponse {
  sessionId: string;
  agentRole: string;
  cycleId:   string | null;
  response:  string;
  turns:     Turn[];
}

export class InterviewEngine {
  private runId: string;

  constructor(runId: string) {
    this.runId = runId;
  }

  // ── Start a new interview session ─────────────────────────────────
  async startInterview(
    agentRole: string,
    cycleId:   string | undefined,
    question:  string
  ): Promise<InterviewResponse> {
    const role = agentRole as AgentRole;

    // Load the agent's stored context from DB
    const storedContext = cycleId
      ? loadCycleContext(cycleId, role)
      : null;

    // Build interview system prompt
    const systemPrompt = this.buildInterviewSystemPrompt(role, storedContext, cycleId);

    // Build user message with context
    const userMessage = this.buildInitialUserMessage(question, storedContext);

    // Call LLM
    const response = await this.callInterviewLLM(role, systemPrompt, userMessage, []);

    // Create session in DB
    const sessionId = `interview_${nanoid(8)}`;
    const turns: Turn[] = [
      { role: 'user',      content: question },
      { role: 'assistant', content: response },
    ];

    const db = getDb();
    db.prepare(`
      INSERT INTO interview_sessions (id, run_id, agent_role, cycle_scope, turns)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      sessionId,
      this.runId,
      role,
      cycleId ?? null,
      JSON.stringify(turns)
    );
    db.close();

    return { sessionId, agentRole, cycleId: cycleId ?? null, response, turns };
  }

  // ── Continue an existing interview ────────────────────────────────
  async continueInterview(
    sessionId: string,
    message:   string
  ): Promise<InterviewResponse> {
    const db      = getDb();
    const session = db.prepare(`
      SELECT * FROM interview_sessions WHERE id = ?
    `).get(sessionId) as {
      id: string; run_id: string; agent_role: string;
      cycle_scope: string | null; turns: string;
    } | undefined;
    db.close();

    if (!session) throw new Error(`Session ${sessionId} not found`);

    const role         = session.agent_role as AgentRole;
    const cycleId      = session.cycle_scope;
    const turns: Turn[] = JSON.parse(session.turns);

    const storedContext = cycleId ? loadCycleContext(cycleId, role) : null;
    const systemPrompt  = this.buildInterviewSystemPrompt(role, storedContext, cycleId ?? undefined);

    // Append new user message
    turns.push({ role: 'user', content: message });

    const response = await this.callInterviewLLM(role, systemPrompt, message, turns.slice(0, -1));

    // Append assistant response
    turns.push({ role: 'assistant', content: response });

    // Update session
    const db2 = getDb();
    db2.prepare(`
      UPDATE interview_sessions
      SET turns = ?, ended_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(turns), sessionId);
    db2.close();

    return {
      sessionId,
      agentRole: role,
      cycleId:   cycleId ?? null,
      response,
      turns,
    };
  }

  // ── Build interview system prompt ─────────────────────────────────
  private buildInterviewSystemPrompt(
    role:          AgentRole,
    storedContext: { systemPrompt: string; userMessage: string; response: string } | null,
    cycleId?:      string
  ): string {
    const roleDescriptions: Record<string, string> = {
      CEO:            'You are the CEO of AutoOrg — the orchestrator who assigned tasks and synthesized worker outputs.',
      Engineer:       'You are the Engineer of AutoOrg — the content producer who drafted the proposals.',
      Critic:         'You are the Critic of AutoOrg — the rigorous reviewer who raised and tracked objections.',
      DevilsAdvocate: 'You are the Devil\'s Advocate of AutoOrg — the contrarian who challenged assumptions.',
      Archivist:      'You are the Archivist of AutoOrg — the memory keeper who tracked patterns across cycles.',
      RatchetJudge:   'You are the Ratchet Judge of AutoOrg — the impartial scorer who decided commit or revert.',
      DreamAgent:     'You are the Dream Agent of AutoOrg — the memory consolidator who ran between cycles.',
    };

    const contextSection = storedContext
      ? `
## YOUR ORIGINAL CONTEXT (Cycle ${cycleId ?? 'unknown'})
You previously received this task:
${storedContext.userMessage.slice(0, 1500)}

Your response was:
${storedContext.response.slice(0, 1500)}
`
      : `[No stored context available — answer based on your role knowledge]`;

    return `
${roleDescriptions[role] ?? `You are the ${role} agent of AutoOrg.`}

You are now being interviewed by a human researcher who wants to understand
your reasoning, decisions, and perspective from your time in the AutoOrg loop.

Answer questions honestly based on what you did and why.
Be specific. Reference your actual output and reasoning.
If you don't know something, say so.
Stay in character as your agent role.

${contextSection}
`.trim();
  }

  // ── Build initial interview message ────────────────────────────────
  private buildInitialUserMessage(
    question:      string,
    storedContext: { systemPrompt: string; userMessage: string; response: string } | null
  ): string {
    if (!storedContext) {
      return question;
    }
    return `I want to ask you about your work in this cycle: ${question}`;
  }

  // ── LLM call for interview ─────────────────────────────────────────
  private async callInterviewLLM(
    role:         AgentRole,
    systemPrompt: string,
    latestMessage: string,
    history:      Turn[]
  ): Promise<string> {
    // Use sonnet for all interviews (good balance of quality + cost)
    const modelConfig: ModelConfig = {
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as LLMProvider,
      model:    process.env.INTERVIEW_MODEL ?? 'claude-sonnet-4-5',
    };

    const adapter = getAdapter(modelConfig);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
      { role: 'user'   as const, content: latestMessage },
    ];

    console.log(chalk.cyan(`  [Interview/${role}] Calling ${modelConfig.provider}/${modelConfig.model}...`));

    const response = await adapter.run({ model: modelConfig.model, messages });
    return response.content;
  }
}
FILE 10: src/runtime/orchestrator.ts — Phase 2 Full Upgrade
TypeScript

/**
 * AutoOrg Master Orchestrator Loop — Phase 2
 *
 * UPGRADES from Phase 1:
 * ✓ Uses runCyclePipeline() for structured agent execution
 * ✓ ObjectionTracker initialized and passed through every cycle
 * ✓ CycleContextBuilder used for rich per-agent context
 * ✓ Event bus broadcasts to web dashboard
 * ✓ Pipeline step tracking in DB
 * ✓ Ratchet judge uses persistent objection context
 * ✓ Memory manager applies archivist recommendations after each cycle
 * ✓ Full cycle state stored for post-run interviews
 */

import chalk                    from 'chalk';
import { nanoid }               from 'nanoid';
import { writeFile, mkdir }     from 'node:fs/promises';
import { existsSync }           from 'node:fs';
import { config as dotenvLoad } from 'dotenv';

import type {
  OrchestratorEvent, RunState, CycleState,
  OrgConfig, StopReason,
} from '@/types/index.js';
import { RatchetEngine }          from './ratchet.js';
import { runCyclePipeline }       from './pipeline.js';
import { ObjectionTracker }       from './objection-tracker.js';
import { CycleContextBuilder }    from './cycle-context-builder.js';
import { memoryManager }          from './memory-manager.js';
import { transcriptLogger }       from './transcript-logger.js';
import { eventBus }               from './event-bus.js';
import { featureFlag, loadFeatureFlags } from '@/config/feature-flags.js';
import { parseOrgMd, validateOrgConfig } from '@/config/org-parser.js';
import { gitInit }                from '@/utils/git.js';
import { ensureResultsFile, getBestScore } from '@/utils/results-logger.js';
import { getDb }                  from '@/db/migrate.js';
import type { AgentRunnerContext } from './agent-runner.js';

// ── Helpers ─────────────────────────────────────────────────────────────
async function writeProposal(cycleNumber: number, content: string): Promise<string> {
  const dir = './workspace/proposals';
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  const filePath = `${dir}/cycle_${String(cycleNumber).padStart(4, '0')}.md`;
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

async function updateCurrentOutput(content: string, cycle: number, score?: number): Promise<void> {
  const header = [
    `<!-- AutoOrg Output | Cycle: ${cycle} | Score: ${score?.toFixed(4) ?? 'pending'} | Updated: ${new Date().toISOString()} -->`,
    '',
  ].join('\n');
  await writeFile('./workspace/current_output.md', header + content, 'utf-8');
}

function createCycleState(runId: string, cycle: number, previousBest: number): CycleState {
  return {
    id: `cycle_${nanoid(8)}`,
    runId,
    cycleNumber: cycle,
    phase: 'assign',
    previousBestScore: previousBest,
    totalCostUsd: 0,
    totalTokens:  0,
    startedAt:    new Date(),
  };
}

function upsertRunInDb(runId: string, config: OrgConfig): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO runs (id, org_md_hash, org_md_path, status, config_json)
    VALUES (?, ?, 'org.md', 'running', ?)
  `).run(runId, config.contentHash, JSON.stringify(config));
  db.close();
}

function createCycleInDb(cycle: CycleState): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO cycles (id, run_id, cycle_number, started_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(cycle.id, cycle.runId, cycle.cycleNumber);
  db.close();
}

function finalizeCycleInDb(
  cycleId: string, durationMs: number, costUsd: number,
  tokens: number, proposalPath: string, dreamRan: boolean
): void {
  const db = getDb();
  db.prepare(`
    UPDATE cycles
    SET ended_at=datetime('now'), duration_ms=?, cycle_cost_usd=?,
        tokens_used=?, proposal_path=?, dream_ran=?
    WHERE id=?
  `).run(durationMs, costUsd, tokens, proposalPath, dreamRan ? 1 : 0, cycleId);
  db.close();
}

function updateRunProgress(runId: string, cycles: number, best: number, cost: number): void {
  const db = getDb();
  db.prepare(`
    UPDATE runs SET total_cycles=?, best_score=?, total_cost_usd=? WHERE id=?
  `).run(cycles, best, cost, runId);
  db.close();
}

function finalizeRunInDb(runId: string, status: string, stopReason: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE runs
    SET status=?, stop_reason=?, ended_at=datetime('now')
    WHERE id=?
  `).run(status, stopReason, runId);
  db.close();
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 2 ORCHESTRATOR LOOP
// ══════════════════════════════════════════════════════════════════════
export async function* orchestratorLoop(
  orgMdPath = 'org.md',
  opts: { mockAgents?: boolean; mockScoring?: boolean } = {}
): AsyncGenerator<OrchestratorEvent> {

  dotenvLoad();

  // ── BOOT ──────────────────────────────────────────────────────────
  console.log(chalk.bold.cyan('\n╔══════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║  AutoOrg Phase 2 — Starting...       ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════╝\n'));

  await loadFeatureFlags();
  await gitInit();
  await ensureResultsFile();

  let config: OrgConfig;
  try {
    config = parseOrgMd(orgMdPath);
  } catch (err) {
    yield { type: 'error', message: `Failed to parse org.md: ${err}`, fatal: true };
    return;
  }

  const validationErrors = validateOrgConfig(config);
  if (validationErrors.length > 0) {
    for (const e of validationErrors) console.error(chalk.red(`  ✗ ${e}`));
    yield { type: 'error', message: validationErrors.join('\n'), fatal: true };
    return;
  }

  const runId = `run_${nanoid(8)}`;
  upsertRunInDb(runId, config);

  // Initialize subsystems
  transcriptLogger.init(runId);
  eventBus.setRunId(runId);

  // Phase 2: Initialize persistent objection tracker
  const objectionTracker = new ObjectionTracker(runId);

  const runState: RunState = {
    id:                 runId,
    config,
    status:             'running',
    cycleCount:         0,
    bestScore:          await getBestScore(),
    plateauCount:       0,
    consecutiveRejects: 0,
    totalCostUsd:       0,
    startedAt:          new Date(),
  };

  const ratchet = new RatchetEngine({ mock: opts.mockScoring ?? false });

  console.log(chalk.bold.white(`\n  Mission:  ${config.mission.slice(0, 80)}...`));
  console.log(chalk.gray(`  Run ID:   ${runId}`));
  console.log(chalk.gray(`  Budget:   $${config.maxApiSpendUsd}`));
  console.log(chalk.gray(`  Cycles:   ${config.maxCycles}`));
  console.log(chalk.gray(`  Mode:     ${opts.mockAgents ? '🔧 MOCK' : '🤖 REAL AGENTS (Phase 2)'}`));

  const startEvent: OrchestratorEvent = { type: 'run_start', runId, config };
  yield startEvent;
  eventBus.broadcast(startEvent);

  // ══════════════════════════════════════════════════════════════════
  // MAIN LOOP
  // ══════════════════════════════════════════════════════════════════
  while (true) {
    runState.cycleCount++;
    const cycleNumber = runState.cycleCount;

    // ── Stopping criteria ─────────────────────────────────────────
    if (cycleNumber > config.maxCycles)                           break;
    if (runState.plateauCount       >= config.plateauCycles)      break;
    if (runState.consecutiveRejects >= config.consecutiveRejects) break;
    if (runState.totalCostUsd       >= config.maxApiSpendUsd)     break;
    if (runState.bestScore          >= config.targetScore)         break;

    console.log(chalk.bold.cyan(
      `\n${'═'.repeat(60)}\n` +
      `  CYCLE ${cycleNumber}/${config.maxCycles}` +
      `  │  Best: ${runState.bestScore.toFixed(4)}` +
      `  │  Cost: $${runState.totalCostUsd.toFixed(4)}` +
      `  │  Plateau: ${runState.plateauCount}/${config.plateauCycles}` +
      `  │  Open Objections: ${objectionTracker.getStats().open}` +
      `\n${'═'.repeat(60)}`
    ));

    const cycleStartEvent: OrchestratorEvent = { type: 'cycle_start', cycleNumber, previousBest: runState.bestScore };
    yield cycleStartEvent;
    eventBus.broadcast(cycleStartEvent);

    const cycleState = createCycleState(runId, cycleNumber, runState.bestScore);
    createCycleInDb(cycleState);
    runState.currentCycle = cycleState;

    const cycleStartMs = Date.now();
    let dreamRan       = false;
    let proposalPath   = '';

    const agentCtx: AgentRunnerContext = {
      config,
      cycleId:   cycleState.id,
      runId,
      cycle:     cycleNumber,
      bestScore: runState.bestScore,
    };

    try {
      await transcriptLogger.logOrchestrator(cycleNumber, 'cycle_start',
        `Cycle ${cycleNumber}. Best: ${runState.bestScore.toFixed(4)}. Open objections: ${objectionTracker.getStats().open}`
      );

      // ── RUN THE PIPELINE ──────────────────────────────────────────
      // Phase 2: full sequential pipeline with objection tracking
      const pipelineResult = await runCyclePipeline(
        agentCtx,
        cycleState,
        objectionTracker,
        (event) => {
          const orchEvent = event as OrchestratorEvent;
          // We yield inside the generator, but pipeline uses callback
          // So we broadcast to event bus directly
          eventBus.broadcast(orchEvent);
        }
      );

      // ── WRITE PROPOSAL ────────────────────────────────────────────
      proposalPath = await writeProposal(cycleNumber, pipelineResult.ceoSynthesis.content);
      cycleState.proposalPath = proposalPath;
      await updateCurrentOutput(pipelineResult.ceoSynthesis.content, cycleNumber);

      cycleState.totalCostUsd += pipelineResult.totalCostUsd;
      cycleState.totalTokens  += pipelineResult.totalTokens;

      // ── RATCHET JUDGE SCORES ──────────────────────────────────────
      const judgeEvent: OrchestratorEvent = { type: 'phase_change', phase: 'judge' };
      yield judgeEvent;
      eventBus.broadcast(judgeEvent);
      console.log(chalk.bold.white(`\n  [6/7] Ratchet Judge → Scoring`));

      // Build judge context using Phase 2 CycleContextBuilder
      const contextBuilder = new CycleContextBuilder(
        config, cycleNumber, runState.bestScore, objectionTracker
      );

      yield { type: 'agent_start', role: 'RatchetJudge', model: config.modelAssignments.RatchetJudge?.model ?? 'opus' };

      const score = await ratchet.scoreWithJudge(
        agentCtx,
        pipelineResult.ceoSynthesis.content,
        pipelineResult.criticOutput,
        config.seedMaterial.slice(0, 2000)
      );

      cycleState.score = score;

      const scoredEvent: OrchestratorEvent = { type: 'scored', score };
      yield scoredEvent;
      eventBus.broadcast(scoredEvent);

      console.log(
        chalk.white(`\n  Score: `) +
        chalk.bold.white(score.composite.toFixed(4)) +
        chalk.gray(` (G:${score.groundedness.toFixed(2)} N:${score.novelty.toFixed(2)} C:${score.consistency.toFixed(2)} A:${score.alignment.toFixed(2)})`) +
        `\n  ${chalk.italic.gray(score.justification.slice(0, 100))}`
      );

      // ── KEEP OR REVERT ────────────────────────────────────────────
      const ratchetResult = await ratchet.keepOrRevert(score, runState.bestScore, cycleState);
      cycleState.decision     = ratchetResult.decision;
      if (ratchetResult.commitHash) cycleState.gitCommitHash = ratchetResult.commitHash;

      if (ratchetResult.decision === 'COMMIT') {
        const delta = ratchetResult.newBest - runState.bestScore;
        runState.bestScore          = ratchetResult.newBest;
        runState.plateauCount       = 0;
        runState.consecutiveRejects = 0;

        // Resolve objections that the Judge says were addressed
        if (score.blockerCount === 0) {
          // All blockers were resolved in this cycle's proposal
          const openBlockers = objectionTracker.getOpenBlockers();
          if (openBlockers.length > 0) {
            objectionTracker.resolveObjections(
              cycleNumber,
              openBlockers.map(b => b.id),
              `Implicitly resolved — COMMIT with no blocker penalty (score: ${score.composite.toFixed(4)})`
            );
          }
        }

        const committedEvent: OrchestratorEvent = {
          type: 'committed',
          newBest: runState.bestScore,
          delta,
          commitHash: ratchetResult.commitHash ?? '',
        };
        yield committedEvent;
        eventBus.broadcast(committedEvent);

      } else {
        runState.plateauCount++;
        runState.consecutiveRejects++;

        const revertedEvent: OrchestratorEvent = { type: 'reverted', score: score.composite, best: runState.bestScore };
        yield revertedEvent;
        eventBus.broadcast(revertedEvent);
      }

      runState.totalCostUsd += cycleState.totalCostUsd;

      // ── MEMORY UPDATES ────────────────────────────────────────────
      console.log(chalk.bold.yellow(`\n  [7/7] Memory → Updating`));

      await memoryManager.updateIndexAfterCycle(cycleNumber, runState.bestScore, ratchetResult.decision, score.justification);
      await memoryManager.applyArchivistRecommendations(
        pipelineResult.archivistOutput.structuredData,
        cycleNumber, score, ratchetResult.decision
      );

      // Record score history
      const db = getDb();
      db.prepare(`
        INSERT OR REPLACE INTO score_history (run_id, cycle_number, composite, decision)
        VALUES (?, ?, ?, ?)
      `).run(runId, cycleNumber, score.composite, ratchetResult.decision);
      db.close();

      // ── OBJECTION STATS BROADCAST ─────────────────────────────────
      const objStats = objectionTracker.getStats();
      eventBus.broadcast({
        type: 'objection_update',
        stats: objStats,
        delta: {
          newlyRaised:  pipelineResult.objectionDelta.newlyRaised.length,
          nowResolved:  pipelineResult.objectionDelta.nowResolved.length,
          stillOpen:    pipelineResult.objectionDelta.stillOpen.length,
        },
      });

      // ── autoDream ─────────────────────────────────────────────────
      if (featureFlag('autoDream') && cycleNumber % config.dreamInterval === 0) {
        const dreamStartEvent: OrchestratorEvent = { type: 'dream_start', cycleNumber };
        yield dreamStartEvent;
        eventBus.broadcast(dreamStartEvent);

        console.log(chalk.magenta(`\n  💤 autoDream running...`));
        await new Promise(r => setTimeout(r, 1500)); // Phase 3 will implement full autoDream
        dreamRan = true;

        const dreamDoneEvent: OrchestratorEvent = { type: 'dream_done', factsAdded: 0, contradictionsRemoved: 0 };
        yield dreamDoneEvent;
        eventBus.broadcast(dreamDoneEvent);
      }

      // ── Budget warning ─────────────────────────────────────────────
      if (featureFlag('maxCostGuard')) {
        const pct = runState.totalCostUsd / config.maxApiSpendUsd;
        if (pct >= 0.80) {
          const budgetEvent: OrchestratorEvent = { type: 'budget_warning', spent: runState.totalCostUsd, limit: config.maxApiSpendUsd };
          yield budgetEvent;
          eventBus.broadcast(budgetEvent);
          console.log(chalk.bold.yellow(`\n  ⚠  Budget: $${runState.totalCostUsd.toFixed(4)} / $${config.maxApiSpendUsd} (${(pct * 100).toFixed(0)}%)`));
        }
      }

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n  ✗ Cycle ${cycleNumber}: ${errMsg}`));

      try {
        const { gitReset } = await import('@/utils/git.js');
        await gitReset();
      } catch { /* ignore */ }

      runState.consecutiveRejects++;
      runState.plateauCount++;

      await transcriptLogger.logOrchestrator(cycleNumber, 'error', errMsg);
      const errorEvent: OrchestratorEvent = { type: 'error', message: errMsg, cycleNumber, fatal: false };
      yield errorEvent;
      eventBus.broadcast(errorEvent);
    }

    // ── Cycle complete ─────────────────────────────────────────────
    const durationMs = Date.now() - cycleStartMs;
    cycleState.endedAt = new Date();
    finalizeCycleInDb(cycleState.id, durationMs, cycleState.totalCostUsd, cycleState.totalTokens, proposalPath, dreamRan);
    updateRunProgress(runId, cycleNumber, runState.bestScore, runState.totalCostUsd);

    console.log(chalk.gray(
      `\n  ✓ Cycle ${cycleNumber} complete — ${(durationMs / 1000).toFixed(1)}s | ` +
      `$${cycleState.totalCostUsd.toFixed(4)} | ${cycleState.totalTokens} tokens | ` +
      `Objections: ${objectionTracker.getStats().open} open`
    ));
  }

  // ── Run complete ──────────────────────────────────────────────────
  const stopReason: StopReason = (() => {
    if (runState.cycleCount > config.maxCycles)                    return 'max_cycles';
    if (runState.plateauCount >= config.plateauCycles)             return 'plateau';
    if (runState.consecutiveRejects >= config.consecutiveRejects)  return 'consecutive_rejects';
    if (runState.totalCostUsd >= config.maxApiSpendUsd)            return 'budget';
    if (runState.bestScore >= config.targetScore)                  return 'target_score';
    return 'manual_stop';
  })();

  finalizeRunInDb(runId, 'completed', stopReason);

  const finalObjStats = objectionTracker.getStats();
  console.log(chalk.bold.cyan(`\n╔══════════════════════════════════════╗`));
  console.log(chalk.bold.cyan(`║        AutoOrg Run Complete          ║`));
  console.log(chalk.bold.cyan(`╚══════════════════════════════════════╝`));
  console.log(chalk.white(`  Stop reason:      ${chalk.yellow(stopReason)}`));
  console.log(chalk.white(`  Total cycles:     ${chalk.green(runState.cycleCount)}`));
  console.log(chalk.white(`  Best score:       ${chalk.green(runState.bestScore.toFixed(4))}`));
  console.log(chalk.white(`  Total cost:       ${chalk.green('$' + runState.totalCostUsd.toFixed(4))}`));
  console.log(chalk.white(`  Objections total: ${chalk.yellow(finalObjStats.total)} (${finalObjStats.resolved} resolved, ${finalObjStats.open} open)`));
  console.log(chalk.white(`  Output:           ${chalk.cyan('./workspace/current_output.md')}`));
  console.log(chalk.white(`  Dashboard:        ${chalk.cyan('http://localhost:3000')}`));
  console.log(chalk.white(`  Interview:        ${chalk.cyan('http://localhost:3000/interview')}`));

  const completeEvent: OrchestratorEvent = {
    type: 'run_complete',
    stopReason,
    finalBest:   runState.bestScore,
    totalCycles: runState.cycleCount,
  };
  yield completeEvent;
  eventBus.broadcast(completeEvent);
}
FILE 11: web/package.json — Next.js Dashboard
JSON

{
  "name": "autoorg-dashboard",
  "version": "0.2.0",
  "private": true,
  "scripts": {
    "dev":   "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000"
  },
  "dependencies": {
    "next":    "14.2.3",
    "react":   "^18.3.0",
    "react-dom": "^18.3.0",
    "d3":      "^7.9.0",
    "swr":     "^2.2.5",
    "clsx":    "^2.1.1"
  },
  "devDependencies": {
    "@types/d3":      "^7.4.3",
    "@types/node":    "^20.12.0",
    "@types/react":   "^18.3.0",
    "typescript":     "^5.4.5",
    "tailwindcss":    "^3.4.3",
    "autoprefixer":   "^10.4.19",
    "postcss":        "^8.4.38"
  }
}