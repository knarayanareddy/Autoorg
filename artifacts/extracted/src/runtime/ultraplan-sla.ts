TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { IncidentLog } from '@/runtime/incident-log.js';

export class UltraPlanSla {
  private incidents = new IncidentLog();

  constructor(private runId: string) {}

  checkpoint(sessionId: string, cycleNumber: number, checkpointNumber: number, summary: string, payload?: unknown) {
    const db = getDb();
    db.prepare(`
      INSERT INTO ultraplan_checkpoints
      (id, session_id, run_id, cycle_number, checkpoint_number, summary, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `upc_${nanoid(8)}`,
      sessionId,
      this.runId,
      cycleNumber,
      checkpointNumber,
      summary,
      JSON.stringify(payload ?? {})
    );

    db.prepare(`
      INSERT INTO ultraplan_sla_events
      (id, session_id, run_id, event_type, details_json)
      VALUES (?, ?, ?, 'checkpoint', ?)
    `).run(
      `upe_${nanoid(8)}`,
      sessionId,
      this.runId,
      JSON.stringify({ checkpointNumber, summary })
    );

    db.close();
  }

  async runWithSla<T>(opts: {
    sessionId: string;
    cycleNumber: number;
    maxDurationMs: number;
    onRun: () => Promise<T>;
    onTimeout?: () => Promise<T>;
  }): Promise<T> {
    const db = getDb();
    db.prepare(`
      INSERT INTO ultraplan_sla_events
      (id, session_id, run_id, event_type, details_json)
      VALUES (?, ?, ?, 'started', ?)
    `).run(
      `upe_${nanoid(8)}`,
      opts.sessionId,
      this.runId,
      JSON.stringify({ maxDurationMs: opts.maxDurationMs })
    );
    db.close();

    let timeoutHandle: Timer | undefined;

    try {
      const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('ULTRAPLAN_TIMEOUT')), opts.maxDurationMs);
      });

      const result = await Promise.race([opts.onRun(), timeoutPromise]);

      const db2 = getDb();
      db2.prepare(`
        INSERT INTO ultraplan_sla_events
        (id, session_id, run_id, event_type, details_json)
        VALUES (?, ?, ?, 'completed', ?)
      `).run(
        `upe_${nanoid(8)}`,
        opts.sessionId,
        this.runId,
        JSON.stringify({ cycleNumber: opts.cycleNumber })
      );
      db2.close();

      return result;
    } catch (error) {
      if ((error as Error).message === 'ULTRAPLAN_TIMEOUT' && opts.onTimeout) {
        const db3 = getDb();
        db3.prepare(`
          INSERT INTO ultraplan_sla_events
          (id, session_id, run_id, event_type, details_json)
          VALUES (?, ?, ?, 'timeout', ?)
        `).run(
          `upe_${nanoid(8)}`,
          opts.sessionId,
          this.runId,
          JSON.stringify({ cycleNumber: opts.cycleNumber, maxDurationMs: opts.maxDurationMs })
        );
        db3.close();

        this.incidents.log({
          runId: this.runId,
          severity: 'warn',
          component: 'ultraplan-sla',
          summary: `ULTRAPLAN timed out in cycle ${opts.cycleNumber}`,
          details: { sessionId: opts.sessionId },
        });

        return await opts.onTimeout();
      }

      throw error;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }
}
Patch src/prompts/ultraplan.ts
Add:

TypeScript

Hard rules:
- You must optimize for best useful answer before deadline, not perfect answer.
- If time is constrained, prioritize bottleneck diagnosis, strategic pivot, and next 5 actions.
- Return a cancellation-safe summary.
- Return at least one checkpoint-quality partial summary inside the final JSON.

Return JSON:
{
  "bottleneck": "...",
  "pivot_hypothesis": "...",
  "five_cycle_plan": ["...", "...", "...", "...", "..."],
  "checkpoint_summary": "...",
  "cancellation_safe_summary": "...",
  "risks": ["..."],
  "expected_score_delta": 0.00
}
14. Team creation should seed memory partitions + budgets
Patch src/runtime/team-manager.ts
After team creation, add:

TypeScript

import { TeamMemoryPartitions } from '@/runtime/memory-partitions.js';
import { BudgetManager } from '@/runtime/budget-manager.js';

const partitions = new TeamMemoryPartitions(this.runId);
const budgets = new BudgetManager(this.runId);

// inside createTeam(...)
await partitions.ensureTeamPartition(teamId, input.name);
budgets.seedDefaults(teamId, {
  usdLimit: input.name === 'Planning' ? 2.5 : 1.25,
  tokenLimit: input.name === 'Planning' ? 60_000 : 30_000,
  toolCallLimit: 40,
  minuteLimit: input.name === 'Planning' ? 30 : 15,
});
This means every department gets:

its own memory lane
its own budget ceiling
independent resource accounting
15. AgentRunner should become team-aware and budget-aware
Patch src/runtime/agent-runner.ts
Add imports:

TypeScript

import { TeamMemoryPartitions } from '@/runtime/memory-partitions.js';
import { BudgetManager } from '@/runtime/budget-manager.js';
import { IncidentLog } from '@/runtime/incident-log.js';
Before model invocation:

TypeScript

const partitions = new TeamMemoryPartitions(ctx.runId);
const budgets = new BudgetManager(ctx.runId);
const incidents = new IncidentLog();

const teamId = ctx.teamId ?? 'shared';
const memoryContext = await partitions.buildContext(ctx.teamId);
const estimatedTokens = Math.ceil((prompt.length || 0) / 3.5);

if (featureFlag('teamBudgets') && ctx.teamId) {
  if (!budgets.canSpend(teamId, 'tokens', estimatedTokens)) {
    incidents.log({
      runId: ctx.runId,
      severity: 'warn',
      component: 'agent-runner',
      summary: `Budget denied for ${ctx.role} on team ${teamId}`,
      details: { estimatedTokens, cycle: ctx.cycle },
    });

    return {
      skipped: true,
      reason: `Budget exceeded for team ${teamId}`,
    };
  }
}

const fullPrompt = [
  prompt,
  '',
  '## TEAM MEMORY CONTEXT',
  memoryContext.slice(0, 2500),
].join('\n');
After successful model return:

TypeScript

if (featureFlag('teamBudgets') && ctx.teamId) {
  const usage = response.usage ?? { inputTokens: estimatedTokens, outputTokens: 0 };
  budgets.spend({
    teamId,
    role: ctx.role,
    cycleNumber: ctx.cycle,
    budgetType: 'tokens',
    delta: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    reason: 'llm_call',
    metadata: { model: ctx.model ?? null },
  });

  if (typeof response.costUsd === 'number') {
    budgets.spend({
      teamId,
      role: ctx.role,
      cycleNumber: ctx.cycle,
      budgetType: 'usd',
      delta: response.costUsd,
      reason: 'llm_call',
      metadata: { model: ctx.model ?? null },
    });
  }
}
16. Orchestrator Phase 5.1 integration
Patch src/runtime/orchestrator.ts
We are adding:

lock acquisition
recovery journal
strict approval materialization path
team budget/memory initialization
ULTRAPLAN SLA wrapper
truthful PENDING_APPROVAL result logging
A. Add imports
TypeScript

import simpleGit from 'simple-git';
import { featureFlag } from '@/config/feature-flags.js';
import { ApprovalEnforcer } from '@/runtime/approval-enforcer.js';
import { WorkspaceLock } from '@/runtime/workspace-lock.js';
import { RecoveryJournal } from '@/runtime/recovery-journal.js';
import { recoverInterruptedRun } from '@/runtime/crash-recover.js';
import { LeaseManager } from '@/runtime/lease-manager.js';
import { BudgetManager } from '@/runtime/budget-manager.js';
import { TeamMemoryPartitions } from '@/runtime/memory-partitions.js';
import { UltraPlanSla } from '@/runtime/ultraplan-sla.js';
import { IncidentLog } from '@/runtime/incident-log.js';
B. After run initialization, create hardening engines
TypeScript

const git = simpleGit();
const approvalEnforcer = new ApprovalEnforcer(runId);
const workspaceLock = new WorkspaceLock();
const recoveryJournal = new RecoveryJournal(runId);
const leaseManager = new LeaseManager(runId);
const budgetManager = new BudgetManager(runId);
const partitions = new TeamMemoryPartitions(runId);
const ultraplanSla = new UltraPlanSla(runId);
const incidents = new IncidentLog();
C. Before entering main loop, acquire workspace lock + recover if needed
TypeScript

if (featureFlag('workspaceLocks')) {
  workspaceLock.acquire(`repo:${process.cwd()}`, `run:${runId}`, runId, 90_000);
}

if (featureFlag('daemonRecovery')) {
  const recovered = await recoverInterruptedRun(runId);
  if (recovered) {
    runState.bestScore = recovered.bestScore ?? runState.bestScore;
    runState.plateauCount = recovered.plateauCount ?? runState.plateauCount;
    runState.consecutiveRejects = recovered.consecutiveRejects ?? runState.consecutiveRejects;
    cycleNumber = Math.max(cycleNumber, recovered.cycleNumber ?? 0);
  }
}

recoveryJournal.checkpoint({
  cycleNumber,
  bestScore: runState.bestScore,
  plateauCount: runState.plateauCount,
  consecutiveRejects: runState.consecutiveRejects,
  stage: 'boot',
});
D. At top of each cycle, heartbeat lock + write checkpoint
TypeScript

if (featureFlag('workspaceLocks')) {
  workspaceLock.heartbeat(`repo:${process.cwd()}`, `run:${runId}`, 90_000);
}

recoveryJournal.checkpoint({
  cycleNumber,
  bestScore: runState.bestScore,
  plateauCount: runState.plateauCount,
  consecutiveRejects: runState.consecutiveRejects,
  stage: 'pre_cycle',
});
E. After coordinator team assignment, initialize budgets + partitions for teams
TypeScript

if (featureFlag('coordinatorHierarchy')) {
  const teams = coordinator.listTeams?.() ?? [];
  for (const team of teams) {
    if (featureFlag('teamMemoryPartitions')) {
      await partitions.ensureTeamPartition(team.id, team.name);
    }
    if (featureFlag('teamBudgets')) {
      budgetManager.seedDefaults(team.id);
    }
  }

  recoveryJournal.checkpoint({
    cycleNumber,
    bestScore: runState.bestScore,
    plateauCount: runState.plateauCount,
    consecutiveRejects: runState.consecutiveRejects,
    stage: 'post_team_assignment',
    extra: { teamCount: teams.length },
  });
}
F. Replace old direct ratchet materialization logic
Find the old block where you do keepOrRevert(...) and replace with:

TypeScript

const decision = ratchet.decide(score, runState.bestScore);

if (decision === 'REVERT') {
  await ratchet.materializeRevert('workspace/current_output.md');
  runState.consecutiveRejects += 1;

  recoveryJournal.checkpoint({
    cycleNumber,
    bestScore: runState.bestScore,
    plateauCount: runState.plateauCount,
    consecutiveRejects: runState.consecutiveRejects,
    stage: 'post_decision',
    extra: { decision: 'REVERT' },
  });

  resultsLogger.append({
    cycle: cycleNumber,
    score: score.composite,
    groundedness: score.groundedness,
    novelty: score.novelty,
    consistency: score.consistency,
    missionAlignment: score.missionAlignment,
    decision: 'REVERT',
    summary: score.justification,
  });
}

if (decision === 'COMMIT') {
  const outputText = await Bun.file('workspace/current_output.md').text();

  if (featureFlag('strictApprovalBlocking')) {
    const staged = await approvalEnforcer.stageCommitCandidate({
      cycleNumber,
      targetFile: 'workspace/current_output.md',
      outputText,
      score,
      summary: score.justification,
    });

    resultsLogger.append({
      cycle: cycleNumber,
      score: score.composite,
      groundedness: score.groundedness,
      novelty: score.novelty,
      consistency: score.consistency,
      missionAlignment: score.missionAlignment,
      decision: 'PENDING_APPROVAL',
      summary: `Commit staged for approval ${staged.approvalId}. ${score.justification}`,
    });
  } else {
    const commitHash = await ratchet.materializeCommit({
      file: 'workspace/current_output.md',
      commitMessage: `cycle-${cycleNumber}: score=${score.composite.toFixed(4)}`,
    });

    runState.bestScore = score.composite;
    runState.consecutiveRejects = 0;

    resultsLogger.append({
      cycle: cycleNumber,
      score: score.composite,
      groundedness: score.groundedness,
      novelty: score.novelty,
      consistency: score.consistency,
      missionAlignment: score.missionAlignment,
      decision: 'COMMIT',
      summary: `Committed ${commitHash}. ${score.justification}`,
    });
  }

  recoveryJournal.checkpoint({
    cycleNumber,
    bestScore: runState.bestScore,
    plateauCount: runState.plateauCount,
    consecutiveRejects: runState.consecutiveRejects,
    stage: 'post_decision',
    extra: { decision: featureFlag('strictApprovalBlocking') ? 'PENDING_APPROVAL' : 'COMMIT' },
  });
}
G. Wrap ULTRAPLAN with SLA enforcement
Replace the current ULTRAPLAN trigger body with:

TypeScript

if (
  featureFlag('ultraplan') &&
  featureFlag('ultraplanSla') &&
  runState.plateauCount >= Math.max(3, Math.floor(config.plateauCycles * 0.6))
) {
  const ultra = await ultraPlanner.createSession({
    config,
    cycleNumber,
    currentBest: runState.bestScore,
    plateauCount: runState.plateauCount,
    mission: config.mission,
  });

  const result = await ultraplanSla.runWithSla({
    sessionId: ultra.sessionId,
    cycleNumber,
    maxDurationMs: config.ultraplanMaxDurationMs ?? 15 * 60 * 1000,
    onRun: async () => {
      const response = await ultraPlanner.executeSession(ultra.sessionId);
      ultraplanSla.checkpoint(
        ultra.sessionId,
        cycleNumber,
        1,
        response.checkpoint_summary ?? 'ULTRAPLAN completed',
        response
      );
      return response;
    },
    onTimeout: async () => ({
      bottleneck: 'ULTRAPLAN timed out before completion.',
      pivot_hypothesis: 'Use last known checkpoint and resume next cycle.',
      five_cycle_plan: [],
      checkpoint_summary: 'Timed out. Resume from saved checkpoint.',
      cancellation_safe_summary: 'Timed out. No strategic pivot approved yet.',
      risks: ['Partial ULTRAPLAN result'],
      expected_score_delta: 0,
    }),
  });

  const approvalId = approvalGate.request({
    runId,
    cycleNumber,
    approvalType: 'ultraplan',
    subject: ultra.sessionId,
    requestedBy: 'CEO',
    summary: `ULTRAPLAN session ${ultra.sessionId} produced a strategic plan.`,
    details: result,
  });

  eventBus.broadcast({
    type: 'ultraplan_ready',
    sessionId: ultra.sessionId,
    approvalId,
    result,
  });
}
H. On graceful shutdown, release workspace lock
TypeScript

process.on('SIGINT', () => {
  try {
    workspaceLock.release(`repo:${process.cwd()}`, `run:${runId}`);
  } finally {
    process.exit(0);
  }
});
17. Daemon Phase 5.1 integration
Patch src/runtime/daemon.ts
Add imports:

TypeScript

import { ApprovalEnforcer } from '@/runtime/approval-enforcer.js';
import { WorkspaceLock } from '@/runtime/workspace-lock.js';
import { LeaseManager } from '@/runtime/lease-manager.js';
import { JobExecutor } from '@/runtime/job-executor.js';
import { recoverInterruptedRun } from '@/runtime/crash-recover.js';
import { translateGitHubIssueEvent } from '@/integrations/issue-translator.js';
import { IncidentLog } from '@/runtime/incident-log.js';
import { getDb } from '@/db/migrate.js';
Inside daemon loop, add:

TypeScript

const enforcer = new ApprovalEnforcer(runId);
const locks = new WorkspaceLock();
const leases = new LeaseManager(runId);
const jobs = new JobExecutor();
const incidents = new IncidentLog();

setInterval(async () => {
  try {
    serviceState.heartbeat?.();

    if (featureFlag('workspaceLocks')) {
      locks.sweepExpired();
    }

    if (featureFlag('workerLeases')) {
      const reclaimed = leases.reclaimExpired();
      if (reclaimed > 0) {
        incidents.log({
          runId,
          severity: 'warn',
          component: 'daemon',
          summary: `Reclaimed ${reclaimed} expired worker leases`,
        });
      }
    }

    if (featureFlag('daemonRecovery')) {
      await recoverInterruptedRun(runId);
    }

    if (featureFlag('strictApprovalBlocking')) {
      await enforcer.materializeApprovedActions();
    }

    if (featureFlag('jobExecutions')) {
      const scheduler = new Scheduler();
      const due = scheduler.dueJobs();
      for (const job of due) {
        await jobs.runJob(job as any, 'daemon_default');
      }
    }

    if (featureFlag('issueTranslation')) {
      const db = getDb();
      const events = db.prepare(`
        SELECT id
        FROM github_events
        WHERE processed = 0 AND event_type IN ('issues', 'issue_comment')
        ORDER BY created_at ASC
        LIMIT 10
      `).all() as Array<{ id: string }>;

      for (const event of events) {
        await translateGitHubIssueEvent(event.id, runId);
        db.prepare(`UPDATE github_events SET processed = 1 WHERE id = ?`).run(event.id);
      }

      db.close();
    }
  } catch (error) {
    incidents.log({
      runId,
      severity: 'error',
      component: 'daemon',
      summary: 'Daemon tick failed',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
  }
}, 5000);
This turns daemon mode into:

lock/lease sweeper
recovery supervisor
approval materializer
scheduled job executor
GitHub issue translator
18. Recovery analyst prompt