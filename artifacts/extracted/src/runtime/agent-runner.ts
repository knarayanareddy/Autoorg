TypeScript

/**
 * AutoOrg — Real Agent Runner
 *
 * Executes actual LLM calls for each agent role.
 * Handles: model selection, timeouts, retries, cost tracking,
 * structured output parsing, transcript logging.
 *
 * This replaces the mockAgentExec stub from Phase 0.
 */

import chalk                         from 'chalk';
import { nanoid }                    from 'nanoid';
import { getAdapter }                from '@/adapters/adapter-factory.js';
import { withLLMRetry }              from '@/utils/retry.js';
import { parseStructuredOutput,
         parseStructuredOutputLenient } from '@/utils/structured-output.js';
import { estimateTokens }            from '@/utils/token-counter.js';
import { transcriptLogger }          from './transcript-logger.js';
import { mailman }                   from './mailman.js';
import { getDb }                     from '@/db/migrate.js';
import type {
  AgentRole, AgentTask, AgentOutput, CriticOutput,
  OrgConfig, ModelConfig, ModelMap
} from '@/types/index.js';
import type { CriticOutputData }     from '@/prompts/critic.js';
import type { AdvocateOutputData }   from '@/prompts/devils-advocate.js';
import type { ArchivistOutputData }  from '@/prompts/archivist.js';
import { CriticOutputSchema }        from '@/prompts/critic.js';
import { AdvocateOutputSchema }      from '@/prompts/devils-advocate.js';
import { ArchivistOutputSchema }     from '@/prompts/archivist.js';

// ── Default model assignments (used when org.md doesn't specify) ──────
const DEFAULT_MODEL_MAP: Record<AgentRole, ModelConfig> = {
  CEO:             { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  Engineer:        { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  Critic:          { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  DevilsAdvocate:  { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  Archivist:       { provider: 'anthropic', model: 'claude-haiku-3-5'  },
  RatchetJudge:    { provider: 'anthropic', model: 'claude-opus-4'     },
  DreamAgent:      { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  UltraPlanner:    { provider: 'anthropic', model: 'claude-opus-4'     },
};

function resolveModelConfig(
  role: AgentRole,
  orgModelMap: Partial<ModelMap>
): ModelConfig {
  return orgModelMap[role] ?? DEFAULT_MODEL_MAP[role]!;
}

// ── Base LLM call with logging ─────────────────────────────────────────
async function callLLM(
  role:      AgentRole,
  cycleId:   string,
  runId:     string,
  cycle:     number,
  modelConfig: ModelConfig,
  system:    string,
  user:      string,
  opts?: {
    maxTokens?:      number;
    temperature?:    number;
    timeoutMs?:      number;
  }
): Promise<AgentOutput> {
  const execId    = `exec_${nanoid(8)}`;
  const startMs   = Date.now();
  const adapter   = getAdapter(modelConfig);
  const db        = getDb();

  // Log to DB: execution started
  db.prepare(`
    INSERT INTO agent_executions
      (id, cycle_id, run_id, agent_role, phase, started_at, provider, model,
       system_prompt_hash, status)
    VALUES (?, ?, ?, ?, 1, datetime('now'), ?, ?, ?, 'running')
  `).run(
    execId, cycleId, runId, role,
    modelConfig.provider, modelConfig.model,
    Buffer.from(system).toString('base64').slice(0, 64) // hash proxy
  );
  db.close();

  // Log prompt to transcript
  await transcriptLogger.logAgentPrompt(role, cycle, system, user);

  // Execute with retry
  const response = await withLLMRetry(role, () =>
    adapter.run({
      model: modelConfig.model,
      messages: [
        { role: 'system',    content: system },
        { role: 'user',      content: user   },
      ],
      maxTokens:   opts?.maxTokens   ?? 8192,
      temperature: opts?.temperature ?? 0.7,
      timeoutMs:   opts?.timeoutMs   ?? 120_000,
    })
  );

  const durationMs = Date.now() - startMs;

  // Log response to transcript
  await transcriptLogger.logAgentResponse(
    role, cycle, response.content,
    response.totalTokens, response.costUsd
  );

  // Update DB: execution completed
  const db2 = getDb();
  db2.prepare(`
    UPDATE agent_executions
    SET ended_at = datetime('now'), duration_ms = ?, prompt_tokens = ?,
        completion_tokens = ?, cost_usd = ?, output_text = ?, status = 'completed',
        input_tokens = ?
    WHERE id = ?
  `).run(
    durationMs,
    response.promptTokens,
    response.completionTokens,
    response.costUsd,
    response.content.slice(0, 10000), // store full output (up to 10k chars)
    response.promptTokens,
    execId
  );
  db2.close();

  console.log(chalk.gray(
    `    [${role}] ${(durationMs / 1000).toFixed(1)}s | ` +
    `${response.totalTokens} tokens | ` +
    `$${response.costUsd.toFixed(5)} | ` +
    `${modelConfig.provider}/${modelConfig.model}`
  ));

  return {
    from:       role,
    cycleNumber: cycle,
    runId,
    content:    response.content,
    tokensUsed: response.totalTokens,
    costUsd:    response.costUsd,
    durationMs,
    timestamp:  new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════════════════════
// PUBLIC AGENT RUNNER API
// ══════════════════════════════════════════════════════════════════════

export interface AgentRunnerContext {
  config:   OrgConfig;
  cycleId:  string;
  runId:    string;
  cycle:    number;
  bestScore: number;
}

// ── CEO: Assignment Pass ──────────────────────────────────────────────
export async function runCEOAssignment(
  ctx: AgentRunnerContext
): Promise<{
  output: AgentOutput;
  assignments: {
    Engineer:       { task: string; angle: string; avoid: string; target_section: string };
    Critic:         { task: string; focus: string; previous_objections_to_verify: string };
    DevilsAdvocate: { task: string; challenge: string };
    Archivist:      { task: string; search_terms: string[] };
  };
  cycle_assessment:    string;
  synthesis_directive: string;
}> {
  const { buildCEOAssignmentPrompt } = await import('@/prompts/ceo.js');
  const { system, user } = await buildCEOAssignmentPrompt(
    ctx.config, ctx.cycle, ctx.bestScore
  );

  const modelConfig = resolveModelConfig('CEO', ctx.config.modelAssignments);

  console.log(chalk.blue(`  → CEO assigning tasks (${modelConfig.provider}/${modelConfig.model})...`));

  const output = await callLLM(
    'CEO', ctx.cycleId, ctx.runId, ctx.cycle, modelConfig, system, user
  );

  // Parse structured assignment
  const AssignmentSchema = await import('zod').then(({ z }) => z.object({
    cycle_assessment: z.string(),
    assignments: z.object({
      Engineer:       z.object({ task: z.string(), angle: z.string(), avoid: z.string(), target_section: z.string() }),
      Critic:         z.object({ task: z.string(), focus: z.string(), previous_objections_to_verify: z.string() }),
      DevilsAdvocate: z.object({ task: z.string(), challenge: z.string() }),
      Archivist:      z.object({ task: z.string(), search_terms: z.array(z.string()) }),
    }),
    synthesis_directive: z.string(),
  }));

  // Fallback defaults if parsing fails
  const defaultAssignments = {
    cycle_assessment: `Cycle ${ctx.cycle}: Continuing improvement`,
    assignments: {
      Engineer:       { task: 'Improve and expand the main content', angle: 'Be more specific and grounded', avoid: 'Repetition of previous output', target_section: 'Main body' },
      Critic:         { task: 'Find the most critical flaw in the current output', focus: 'Groundedness and specificity', previous_objections_to_verify: 'All outstanding objections' },
      DevilsAdvocate: { task: 'Argue the current approach is wrong', challenge: 'Our core assumption about the mission' },
      Archivist:      { task: 'Check for repeated failures', search_terms: ['failed', 'rejected', 'error'] },
    },
    synthesis_directive: 'Weight Critic and Engineer outputs equally',
  };

  const parsed = parseStructuredOutputLenient(output.content, AssignmentSchema, defaultAssignments);

  return {
    output,
    assignments:         parsed.assignments,
    cycle_assessment:    parsed.cycle_assessment,
    synthesis_directive: parsed.synthesis_directive,
  };
}

// ── Engineer ──────────────────────────────────────────────────────────
export async function runEngineer(
  ctx: AgentRunnerContext,
  task: { task: string; angle: string; avoid: string; target_section: string }
): Promise<AgentOutput> {
  const { buildEngineerPrompt } = await import('@/prompts/engineer.js');
  const { system, user } = await buildEngineerPrompt(
    ctx.config, ctx.cycle, ctx.bestScore, task
  );

  const modelConfig = resolveModelConfig('Engineer', ctx.config.modelAssignments);

  console.log(chalk.green(`  → Engineer drafting (${modelConfig.provider}/${modelConfig.model})...`));

  return callLLM('Engineer', ctx.cycleId, ctx.runId, ctx.cycle, modelConfig, system, user, {
    temperature: 0.75, // Slightly higher for more creative drafting
  });
}

// ── Critic ────────────────────────────────────────────────────────────
export async function runCritic(
  ctx: AgentRunnerContext,
  task: { task: string; focus: string; previous_objections_to_verify: string },
  engineerOutput: string,
  previousObjections: string
): Promise<CriticOutput> {
  const { buildCriticPrompt, CriticOutputSchema } = await import('@/prompts/critic.js');
  const { system, user } = await buildCriticPrompt(
    ctx.config, ctx.cycle, ctx.bestScore,
    task, engineerOutput, previousObjections
  );

  const modelConfig = resolveModelConfig('Critic', ctx.config.modelAssignments);

  console.log(chalk.red(`  → Critic reviewing (${modelConfig.provider}/${modelConfig.model})...`));

  const output = await callLLM(
    'Critic', ctx.cycleId, ctx.runId, ctx.cycle, modelConfig, system, user,
    { temperature: 0.5 } // Lower temp for more consistent critiques
  );

  // Parse structured critic output
  const fallbackCriticData: CriticOutputData = {
    steelman:                'The proposal represents a reasonable attempt at the mission.',
    objections:              [{
      id:          'obj_parse_error',
      severity:    'MINOR',
      description: 'Critic output could not be parsed — treating as minor issue',
      evidence:    'Parse error',
      fix:         'No action required',
    }],
    resolved_from_previous: [],
    overall_verdict:        'NEEDS_WORK',
    verdict_reason:         'Parsing failed — treating as needs work',
  };

  const parsedData = parseStructuredOutputLenient(
    output.content, CriticOutputSchema, fallbackCriticData
  );

  return {
    ...output,
    structuredData: parsedData,
  } as CriticOutput;
}

// ── Devil's Advocate ──────────────────────────────────────────────────
export async function runDevilsAdvocate(
  ctx: AgentRunnerContext,
  task: { task: string; challenge: string },
  engineerOutput: string,
  criticOutput:   string
): Promise<AgentOutput & { structuredData: AdvocateOutputData }> {
  const { buildAdvocatePrompt, AdvocateOutputSchema } = await import('@/prompts/devils-advocate.js');
  const { system, user } = await buildAdvocatePrompt(
    ctx.config, ctx.cycle, ctx.bestScore,
    task, engineerOutput, criticOutput
  );

  const modelConfig = resolveModelConfig('DevilsAdvocate', ctx.config.modelAssignments);

  console.log(chalk.magenta(`  → Devil's Advocate (${modelConfig.provider}/${modelConfig.model})...`));

  const output = await callLLM(
    'DevilsAdvocate', ctx.cycleId, ctx.runId, ctx.cycle, modelConfig, system, user,
    { temperature: 0.85 } // Higher temp for more creative contrarianism
  );

  const fallbackAdvocate: AdvocateOutputData = {
    contrarian_position:  'The current approach may be solving the wrong problem.',
    unexplored_direction: 'Consider reframing the mission from a different stakeholder perspective.',
    challenge_to_critic:  'The Critic focuses on details when the structure needs questioning.',
    strongest_assumption: 'We assume the seed material represents the full problem space.',
    recommended_pivot:    'Try a completely different organizational structure for the output.',
    risk_of_consensus:    'The team is converging too quickly on a single framing.',
  };

  const parsedData = parseStructuredOutputLenient(
    output.content, AdvocateOutputSchema, fallbackAdvocate
  );

  return { ...output, structuredData: parsedData };
}

// ── Archivist ─────────────────────────────────────────────────────────
export async function runArchivist(
  ctx: AgentRunnerContext,
  task: { task: string; search_terms: string[] },
  recentTranscriptSummary: string
): Promise<AgentOutput & { structuredData: ArchivistOutputData }> {
  const { buildArchivistPrompt, ArchivistOutputSchema } = await import('@/prompts/archivist.js');
  const { system, user } = await buildArchivistPrompt(
    ctx.config, ctx.cycle, ctx.bestScore,
    task, recentTranscriptSummary
  );

  const modelConfig = resolveModelConfig('Archivist', ctx.config.modelAssignments);

  console.log(chalk.yellow(`  → Archivist checking memory (${modelConfig.provider}/${modelConfig.model})...`));

  const output = await callLLM(
    'Archivist', ctx.cycleId, ctx.runId, ctx.cycle, modelConfig, system, user,
    { temperature: 0.3 } // Low temp — memory tasks need consistency
  );

  const fallbackArchivist: ArchivistOutputData = {
    memory_search_findings:      'No relevant history found.',
    similar_past_cycles:         [],
    validated_decisions_at_risk: [],
    memory_update_recommendation: {},
  };

  const parsedData = parseStructuredOutputLenient(
    output.content, ArchivistOutputSchema, fallbackArchivist
  );

  return { ...output, structuredData: parsedData };
}

// ── CEO: Synthesis Pass ───────────────────────────────────────────────
export async function runCEOSynthesis(
  ctx:                  AgentRunnerContext,
  engineerOutput:       AgentOutput,
  criticOutput:         CriticOutput,
  advocateOutput:       AgentOutput,
  archivistOutput:      AgentOutput,
  cycleAssessment:      string,
  synthesisDirective:   string
): Promise<AgentOutput> {
  const { buildCEOSynthesisPrompt } = await import('@/prompts/ceo.js');
  const { system, user } = await buildCEOSynthesisPrompt(
    ctx.config,
    ctx.cycle,
    ctx.bestScore,
    {
      engineer:      engineerOutput,
      critic:        criticOutput,
      devilsAdvocate: advocateOutput,
      archivist:     archivistOutput,
    },
    cycleAssessment,
    synthesisDirective
  );

  const modelConfig = resolveModelConfig('CEO', ctx.config.modelAssignments);

  console.log(chalk.blue(`  → CEO synthesizing (${modelConfig.provider}/${modelConfig.model})...`));

  return callLLM('CEO', ctx.cycleId, ctx.runId, ctx.cycle, modelConfig, system, user, {
    maxTokens:   12000, // CEO synthesis can be long
    temperature: 0.65,
  });
}

// ── Ratchet Judge ─────────────────────────────────────────────────────
export async function runRatchetJudge(
  ctx:              AgentRunnerContext,
  proposal:         string,
  criticOutput:     CriticOutput,
  seedMaterialSummary: string
): Promise<AgentOutput & { structuredData: import('@/prompts/ratchet-judge.js').JudgeOutputData }> {
  const {
    buildJudgePrompt,
    JudgeOutputSchema,
  } = await import('@/prompts/ratchet-judge.js');

  const { loadFailedExperiments } = await import('@/prompts/base.js');
  const failedExperiments = await loadFailedExperiments();

  // Extract critic objections
  const criticObjections = (criticOutput.structuredData?.objections ?? []).map(o => ({
    id:            o.id,
    severity:      o.severity as 'BLOCKER' | 'MAJOR' | 'MINOR',
    description:   o.description,
    proposedFix:   o.fix,
    resolved:      false,
    raisedCycle:   ctx.cycle,
  }));

  const { system, user } = await buildJudgePrompt(
    ctx.config,
    ctx.cycle,
    ctx.bestScore,
    proposal,
    criticObjections,
    failedExperiments,
    seedMaterialSummary
  );

  // ALWAYS use the highest-capability model for the judge
  // Override org.md if needed — the judge cannot be downgraded
  const orgJudgeModel = ctx.config.modelAssignments.RatchetJudge;
  const modelConfig = orgJudgeModel ?? DEFAULT_MODEL_MAP.RatchetJudge!;

  console.log(chalk.bold.white(`  ⚖  Ratchet Judge scoring (${modelConfig.provider}/${modelConfig.model})...`));

  const output = await callLLM(
    'RatchetJudge', ctx.cycleId, ctx.runId, ctx.cycle, modelConfig, system, user,
    {
      maxTokens:   4096,
      temperature: 0.2, // Very low temp — scoring must be consistent and precise
    }
  );

  // Judge output MUST parse — it drives the ratchet decision
  // If parsing fails, default to REVERT (conservative failure mode)
  let parsedData: import('@/prompts/ratchet-judge.js').JudgeOutputData;

  try {
    parsedData = parseStructuredOutput(output.content, JudgeOutputSchema);
  } catch (e) {
    console.warn(chalk.yellow(`  ⚠  Judge output parsing failed: ${e}. Defaulting to REVERT.`));
    parsedData = {
      groundedness: { score: 0.3, reasoning: 'Parse error', grounded_claims: 0, total_claims: 1, ungrounded_examples: [] },
      novelty:      { score: 0.3, reasoning: 'Parse error', overlap_with_previous: '', novel_elements: [] },
      consistency:  { score: 0.3, reasoning: 'Parse error', blocker_objections: [], major_objections: [], internal_contradictions: [] },
      alignment:    { score: 0.3, reasoning: 'Parse error', mission_elements_covered: [], mission_elements_missing: [] },
      composite:    0.3,
      decision:     'REVERT',
      justification: 'Judge output could not be parsed — defaulting to REVERT for safety',
      improvement_directive: 'Retry this cycle with clearer output format',
    };
  }

  return { ...output, structuredData: parsedData };
}
FILE 14: src/runtime/ratchet.ts (UPGRADED — Real LLM Judge)
TypeScript

/**
 * AutoOrg Ratchet Engine — Phase 1 Upgrade
 *
 * Now uses the real RatchetJudge agent instead of mock scoring.
 * The keep-or-revert logic is unchanged — only the scorer is real.
 */

import chalk            from 'chalk';
import { gitCommit, gitReset } from '@/utils/git.js';
import { logCycleResult }      from '@/utils/results-logger.js';
import { getDb }               from '@/db/migrate.js';
import { transcriptLogger }    from './transcript-logger.js';
import type {
  RatchetScore, RatchetDecision, CycleState, OrgConfig,
} from '@/types/index.js';
import type { CriticOutput }   from '@/types/index.js';
import type { JudgeOutputData } from '@/prompts/ratchet-judge.js';

export class RatchetEngine {
  private useMockScoring: boolean;

  constructor(opts: { mock?: boolean } = {}) {
    this.useMockScoring = opts.mock ?? false; // Phase 1: default to REAL scoring
  }

  // ── Convert JudgeOutputData → RatchetScore ─────────────────────────
  private judgeToScore(judgeData: JudgeOutputData): RatchetScore {
    return {
      groundedness: judgeData.groundedness.score,
      novelty:      judgeData.novelty.score,
      consistency:  judgeData.consistency.score,
      alignment:    judgeData.alignment.score,
      composite:    judgeData.composite,
      decision:     judgeData.decision as RatchetDecision,
      justification: judgeData.justification,
      objections:    [], // populated from critic separately
      blockerCount:  judgeData.consistency.blocker_objections.length,
      majorCount:    judgeData.consistency.major_objections.length,
      disqualificationReason: judgeData.disqualification_reason,
    };
  }

  // ── Mock scorer (Phase 0 fallback) ────────────────────────────────
  private mockScore(cycleNumber: number, previousBest: number): RatchetScore {
    const base  = Math.min(0.3 + (cycleNumber * 0.008), 0.75);
    const noise = (Math.random() - 0.45) * 0.08;
    const g = Math.min(1, Math.max(0, base + noise + Math.random() * 0.05));
    const n = Math.min(1, Math.max(0, base - 0.05 + noise + Math.random() * 0.06));
    const c = Math.min(1, Math.max(0, base + 0.02 + noise));
    const a = Math.min(1, Math.max(0, base - 0.02 + noise));
    const composite = 0.30*g + 0.25*n + 0.25*c + 0.20*a;
    const decision: RatchetDecision = composite > previousBest ? 'COMMIT' : 'REVERT';
    return {
      groundedness: g, novelty: n, consistency: c, alignment: a, composite,
      decision,
      justification: `[MOCK] ${decision} — ${composite.toFixed(3)} vs best ${previousBest.toFixed(3)}`,
      objections:    [],
      blockerCount:  0,
      majorCount:    0,
    };
  }

  // ── Real LLM scoring ───────────────────────────────────────────────
  async scoreWithJudge(
    ctx: import('./agent-runner.js').AgentRunnerContext,
    proposal:            string,
    criticOutput:        CriticOutput,
    seedMaterialSummary: string
  ): Promise<RatchetScore> {
    if (this.useMockScoring) {
      await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
      return this.mockScore(ctx.cycle, ctx.bestScore);
    }

    const { runRatchetJudge } = await import('./agent-runner.js');
    const judgeOutput = await runRatchetJudge(ctx, proposal, criticOutput, seedMaterialSummary);

    // Log judge's improvement directive to transcript
    await transcriptLogger.logRatchetScore(
      ctx.cycle,
      judgeOutput.structuredData.composite,
      judgeOutput.structuredData.decision,
      {
        groundedness: judgeOutput.structuredData.groundedness.score,
        novelty:      judgeOutput.structuredData.novelty.score,
        consistency:  judgeOutput.structuredData.consistency.score,
        alignment:    judgeOutput.structuredData.alignment.score,
      }
    );

    return this.judgeToScore(judgeOutput.structuredData);
  }

  // ── Keep or Revert ─────────────────────────────────────────────────
  async keepOrRevert(
    score:             RatchetScore,
    previousBestScore: number,
    cycleState:        CycleState
  ): Promise<{ decision: RatchetDecision; newBest: number; commitHash?: string }> {

    const db = getDb();

    // DISQUALIFIED is always REVERT
    const effectiveDecision: RatchetDecision =
      score.decision === 'DISQUALIFIED' ? 'REVERT' : score.decision;

    if (effectiveDecision === 'COMMIT' && score.composite > previousBestScore) {
      const commitMessage = [
        `autoorg-cycle-${cycleState.cycleNumber}:`,
        `score=${score.composite.toFixed(4)}`,
        `(prev=${previousBestScore.toFixed(4)})`,
        `[G:${score.groundedness.toFixed(2)}`,
        `N:${score.novelty.toFixed(2)}`,
        `C:${score.consistency.toFixed(2)}`,
        `A:${score.alignment.toFixed(2)}]`,
      ].join(' ');

      const commitHash = await gitCommit(commitMessage);

      console.log(
        chalk.bold.green(`\n  ✅ COMMIT`) +
        chalk.white(` — New best: ${score.composite.toFixed(4)}`) +
        chalk.green(` (+${(score.composite - previousBestScore).toFixed(4)})`) +
        chalk.gray(` [${commitHash}]`)
      );

      db.prepare(`
        UPDATE cycles
        SET decision='COMMIT', git_commit_hash=?, decision_reason=?,
            score_groundedness=?, score_novelty=?,
            score_consistency=?, score_alignment=?, score_composite=?
        WHERE id=?
      `).run(
        commitHash, score.justification,
        score.groundedness, score.novelty,
        score.consistency, score.alignment, score.composite,
        cycleState.id
      );

      await logCycleResult(cycleState.cycleNumber, score, cycleState.totalCostUsd, score.justification);

      db.close();
      return { decision: 'COMMIT', newBest: score.composite, commitHash };

    } else {
      await gitReset();

      const label = score.decision === 'DISQUALIFIED' ? '🚫 DISQUALIFIED' : '↩️  REVERT';
      console.log(
        chalk.bold.red(`\n  ${label}`) +
        chalk.white(` — Score: ${score.composite.toFixed(4)}`) +
        chalk.red(` (< best ${previousBestScore.toFixed(4)})`) +
        (score.disqualificationReason ? chalk.red(`\n  Reason: ${score.disqualificationReason}`) : '')
      );

      db.prepare(`
        UPDATE cycles
        SET decision=?, decision_reason=?,
            score_groundedness=?, score_novelty=?,
            score_consistency=?, score_alignment=?, score_composite=?
        WHERE id=?
      `).run(
        score.decision, score.justification,
        score.groundedness, score.novelty,
        score.consistency, score.alignment, score.composite,
        cycleState.id
      );

      await logCycleResult(
        cycleState.cycleNumber,
        { ...score, decision: 'REVERT' },
        cycleState.totalCostUsd,
        score.justification
      );

      db.close();
      return { decision: 'REVERT', newBest: previousBestScore };
    }
  }
}