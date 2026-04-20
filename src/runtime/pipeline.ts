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
