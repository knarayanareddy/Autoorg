/**
 * AutoOrg Master Orchestrator Loop — Phase 3
 *
 * UPGRADES from Phase 2:
 * ✓ Full autoDream engine integrated (not stub)
 * ✓ Dream triggered by interval, plateau, AND memory health
 * ✓ Memory manager initialized with run ID (fact store active)
 * ✓ Memory health checked every cycle
 * ✓ Semantic search available to all agents via memory manager
 * ✓ Transcript indexed after each cycle (FTS5 + embeddings)
 * ✓ Fact store updated from ratchet decisions
 * ✓ Dream results broadcast to web dashboard
 */

import chalk                     from 'chalk';
import { nanoid }                from 'nanoid';
import { writeFile, mkdir }      from 'node:fs/promises';
import { existsSync }            from 'node:fs';
import { config as dotenvLoad }  from 'dotenv';

import { SnapshotService }       from './snapshot-service.js';
import { ObjectiveOptimizer }    from '@/evals/objective-optimizer.js';
import { ReflectionService }     from '@/evals/reflection.js';
import { PivotEngine }           from './pivot-engine.js';
import { SwarmCoordinator }      from '@/swarm/swarm-coordinator.js';
import { EconomicEngine }        from '@/swarm/economic-engine.js';

import type {
  OrchestratorEvent, RunState, CycleState,
  OrgConfig, StopReason,
} from '@/types/index.js';
import { RatchetEngine }              from './ratchet.js';
import { runCyclePipeline }           from './pipeline.js';
import { ObjectionTracker }           from './objection-tracker.js';
import { memoryManager }              from './memory-manager.js';
import { graphManager }               from './graph-manager.js';
import { CoordinatorEngine }          from './coordinator.js';
import { TeamManager }                from './team-manager.js';
import { ToolRegistry }               from '@/tools/registry.js';
import { ToolPolicy }                 from '@/tools/tool-policy.js';

// Import tool manifests to register them
import '@/tools/manifests/repo-search.js';
import '@/tools/manifests/web-fetch.js';
import '@/tools/manifests/sandbox-exec.js';

import { transcriptLogger }           from './transcript-logger.js';
import { eventBus }                   from './event-bus.js';
import { DreamEngine, shouldTriggerDream } from './dream.js';
import { featureFlag, loadFeatureFlags }  from '@/config/feature-flags.js';
import { parseOrgMd, validateOrgConfig } from '@/config/org-parser.js';
import { gitInit }                    from '@/utils/git.js';
import { ensureResultsFile, getBestScore } from '@/utils/results-logger.js';
import { getDb }                      from '@/db/migrate.js';
import type { AgentRunnerContext }    from './agent-runner.js';
import { GraphBuilder }               from '@/graph/graph-builder.js';
import { createBestAvailableGraphDB } from '@/graph/graph-db.js';

// ── Helpers (same as Phase 2) ──────────────────────────────────────────
async function writeProposal(cycleNumber: number, content: string): Promise<string> {
  const dir = './workspace/proposals';
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  const filePath = `${dir}/cycle_${String(cycleNumber).padStart(4, '0')}.md`;
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

async function updateCurrentOutput(content: string, cycle: number, score?: number): Promise<void> {
  const header = `<!-- AutoOrg | Cycle: ${cycle} | Score: ${score?.toFixed(4) ?? 'pending'} | ${new Date().toISOString()} -->\n\n`;
  await writeFile('./workspace/current_output.md', header + content, 'utf-8');
}

function createCycleState(runId: string, cycle: number, prevBest: number): CycleState {
  return {
    id: `cycle_${nanoid(8)}`, runId, cycleNumber: cycle,
    phase: 'assign', previousBestScore: prevBest,
    totalCostUsd: 0, totalTokens: 0, startedAt: new Date(),
  };
}

function upsertRunInDb(runId: string, config: OrgConfig): void {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO runs (id,org_md_hash,org_md_path,status,config_json) VALUES (?,?,'org.md','running',?)`)
    .run(runId, config.contentHash, JSON.stringify(config));
  db.close();
}

function createCycleInDb(c: CycleState): void {
  const db = getDb();
  db.prepare(`INSERT INTO cycles (id,run_id,cycle_number,started_at) VALUES (?,?,?,datetime('now'))`)
    .run(c.id, c.runId, c.cycleNumber);
  db.close();
}

function finalizeCycleInDb(id: string, ms: number, cost: number, tokens: number, path: string, dream: boolean): void {
  const db = getDb();
  db.prepare(`UPDATE cycles SET ended_at=datetime('now'),duration_ms=?,cycle_cost_usd=?,tokens_used=?,proposal_path=?,dream_ran=? WHERE id=?`)
    .run(ms, cost, tokens, path, dream ? 1 : 0, id);
  db.close();
}

function updateRunProgress(runId: string, cycles: number, best: number, cost: number): void {
  const db = getDb();
  db.prepare(`UPDATE runs SET total_cycles=?,best_score=?,total_cost_usd=? WHERE id=?`)
    .run(cycles, best, cost, runId);
  db.close();
}

function finalizeRunInDb(runId: string, status: string, reason: string): void {
  const db = getDb();
  db.prepare(`UPDATE runs SET status=?,stop_reason=?,ended_at=datetime('now') WHERE id=?`)
    .run(status, reason, runId);
  db.close();
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 3 ORCHESTRATOR LOOP
// ══════════════════════════════════════════════════════════════════════
export async function* orchestratorLoop(
  orgMdPath = 'org.md',
  opts: { mockAgents?: boolean; mockScoring?: boolean } = {}
): AsyncGenerator<OrchestratorEvent> {

  dotenvLoad();

  console.log(chalk.bold.cyan('\n╔══════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║  AutoOrg Phase 3 — Starting...       ║'));
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

  // ── Phase 4: Initialize memory manager with run context ───────────
  await memoryManager.initialize(runId);
  transcriptLogger.init(runId);
  eventBus.setRunId(runId);

  // ── Phase 4: Init graph and hierarchical teams ────────────────────
  await graphManager.init(runId);
  await graphManager.ensureBuilt({
    seedMaterial: [config.seedMaterial],
  });
  
  // Phase 5: Init hierarchical teams
  const coordinator = new CoordinatorEngine(runId);
  coordinator.ensureDefaultTeams(1);

  // Phase 6: Seed tool policies
  if (featureFlag('toolUse')) {
    const policy = new ToolPolicy(runId);
    policy.seedDefaults();
  }

  // ── Phase 4: Build initial knowledge graph from seed material ─────
  if (featureFlag('knowledgeGraph')) {
    const graphDb = memoryManager.getGraphDb();
    const builder = new GraphBuilder(runId, graphDb);
    
    // Check if graph already has nodes for this run
    const stats = await graphDb.getStats();
    if (stats.nodeCount === 0) {
      await builder.buildFromSeedMaterial(config.seedMaterial, config);
    }
  }

  // ── Phase 3: Initialize dream engine ─────────────────────────────
  const dreamEngine = new DreamEngine(runId);

  // ── Phase 2: Initialize objection tracker ─────────────────────────
  const objectionTracker = new ObjectionTracker(runId);

  // ── Phase 9: Initialize Adaptation Engine ─────────────────────────
  const snapshots = new SnapshotService(runId);
  const optimizer = new ObjectiveOptimizer(runId);
  const reflection = new ReflectionService(runId);
  const pivoting = new PivotEngine(runId);

  // ── Phase 10: Initialize Swarm Engine ─────────────────────────────
  const swarm = new SwarmCoordinator(runId);
  const economics = new EconomicEngine(runId);
  await economics.ensureWallet();

  const runState: RunState = {
    id: runId, config, status: 'running',
    cycleCount: 0, bestScore: await getBestScore(),
    plateauCount: 0, consecutiveRejects: 0,
    totalCostUsd: 0, cycleHistory: [], startedAt: new Date(),
  };

  // Score history for DreamAgent (accumulated during run)
  const scoreHistory: Array<{ cycle: number; score: number; decision: string }> = [];

  const ratchet = new RatchetEngine({ mock: opts.mockScoring ?? false });

  console.log(chalk.bold.white(`\n  Mission:  ${config.mission.slice(0, 80)}...`));
  console.log(chalk.gray(`  Run ID:   ${runId}`));
  console.log(chalk.gray(`  Mode:     Phase 3 (Full Memory System + autoDream)`));

  const startEvt: OrchestratorEvent = { type: 'run_start', runId, config };
  yield startEvt;
  eventBus.broadcast(startEvt);

  // ════════════════════════════════════════════════════════════════
  // MAIN LOOP
  // ════════════════════════════════════════════════════════════════
  while (true) {
    runState.cycleCount++;
    const cycleNumber = runState.cycleCount;

    // ── Stopping criteria ─────────────────────────────────────────
    if (cycleNumber > config.maxCycles)                           break;
    if (runState.plateauCount       >= config.plateauCycles)      break;
    if (runState.consecutiveRejects >= config.consecutiveRejects) break;
    if (runState.totalCostUsd       >= config.maxApiSpendUsd)     break;
    if (runState.bestScore          >= config.targetScore)         break;

    // ── Memory health check (Phase 3) ─────────────────────────────
    const memHealth = await memoryManager.checkHealth(cycleNumber);
    if (memHealth.critical.length > 0) {
      for (const c of memHealth.critical) {
        console.warn(chalk.bold.red(`  ⚠️  MEMORY CRITICAL: ${c}`));
      }
    }

    console.log(chalk.bold.cyan(
      `\n${'═'.repeat(62)}\n` +
      `  CYCLE ${cycleNumber}/${config.maxCycles}` +
      `  │  Best: ${runState.bestScore.toFixed(4)}` +
      `  │  Cost: $${runState.totalCostUsd.toFixed(4)}` +
      `  │  Plateau: ${runState.plateauCount}` +
      `  │  Facts: ${memoryManager.getFactStore().getStats().active}` +
      `\n${'═'.repeat(62)}`
    ));

    // ── Phase 9: State Snapshot & Objective Tuning ────────────────
    if (featureFlag('cycleSnapshots')) {
      await snapshots.takeCycleSnapshot(cycleNumber);
    }
    const weights = await optimizer.getLatestObjectives();
    const dynamicModelMap = optimizer.calculateModelMap(weights);
    // Overlay dynamic model shifts onto config
    const currentModelAssignments: any = { ...config.modelAssignments };
    for (const [role, model] of Object.entries(dynamicModelMap)) {
      if (!currentModelAssignments[role]) currentModelAssignments[role] = { model };
      else currentModelAssignments[role].model = model;
    }

    const previousBest = runState.bestScore;
    const cycleStartEvt: OrchestratorEvent = { type: 'cycle_start', cycleNumber, previousBest };
    yield cycleStartEvt;
    eventBus.broadcast(cycleStartEvt);

    const cycleState = createCycleState(runId, cycleNumber, runState.bestScore);
    createCycleInDb(cycleState);
    runState.currentCycle = cycleState;

    const cycleStartMs = Date.now();
    let   dreamRan     = false;
    let   proposalPath = '';

    const agentCtx: AgentRunnerContext = {
      config, cycleId: cycleState.id, runId,
      cycle: cycleNumber, bestScore: runState.bestScore,
    };

    try {
      await transcriptLogger.logOrchestrator(cycleNumber, 'cycle_start',
        `Cycle ${cycleNumber}. Best: ${runState.bestScore.toFixed(4)}. ` +
        `Facts: ${memoryManager.getFactStore().getStats().active}. ` +
        `Open objections: ${objectionTracker.getStats().open}`
      );

      // ── RUN THE PIPELINE ──────────────────────────────────────────
      const pipelineResult = await runCyclePipeline(
        agentCtx,
        cycleState,
        objectionTracker,
        (event) => eventBus.broadcast(event as OrchestratorEvent)
      );

      // ── WRITE PROPOSAL & UPDATE OUTPUT ────────────────────────────
      proposalPath = await writeProposal(cycleNumber, pipelineResult.ceoSynthesis.content);
      cycleState.proposalPath = proposalPath;
      await updateCurrentOutput(pipelineResult.ceoSynthesis.content, cycleNumber);

      cycleState.totalCostUsd += pipelineResult.totalCostUsd;
      cycleState.totalTokens  += pipelineResult.totalTokens;

      // ── RATCHET JUDGE ─────────────────────────────────────────────
      const judgeEvt: OrchestratorEvent = { type: 'phase_change', phase: 'judge' };
      yield judgeEvt;
      eventBus.broadcast(judgeEvt);

      yield { type: 'agent_start', role: 'RatchetJudge', model: config.modelAssignments.RatchetJudge?.model ?? 'opus' };

      const score = await ratchet.scoreWithJudge(
        agentCtx,
        pipelineResult.ceoSynthesis.content,
        pipelineResult.criticOutput,
        config.seedMaterial.slice(0, 2000)
      );

      cycleState.score = score;

      const scoredEvt: OrchestratorEvent = { type: 'scored', score };
      yield scoredEvt;
      eventBus.broadcast(scoredEvt);

      console.log(
        chalk.white(`\n  Score: `) +
        chalk.bold.white(score.composite.toFixed(4)) +
        chalk.gray(` (G:${score.groundedness.toFixed(2)} N:${score.novelty.toFixed(2)} C:${score.consistency.toFixed(2)} A:${score.alignment.toFixed(2)})`) +
        `\n  ${chalk.italic.gray(score.justification.slice(0, 100))}`
      );

      // ── KEEP OR REVERT ─────────────────────────────────────────────
      const ratchetResult = await ratchet.keepOrRevert(score, runState.bestScore, cycleState);
      cycleState.decision = ratchetResult.decision;
      if (ratchetResult.commitHash) cycleState.gitCommitHash = ratchetResult.commitHash;

      // ── Update score history for DreamAgent ───────────────────────
      scoreHistory.push({
        cycle:    cycleNumber,
        score:    score.composite,
        decision: ratchetResult.decision,
      });

      if (ratchetResult.decision === 'COMMIT') {
        const delta = ratchetResult.newBest - runState.bestScore;
        runState.bestScore          = ratchetResult.newBest;
        runState.plateauCount       = 0;
        runState.consecutiveRejects = 0;

        // Phase 3: Record validated decision in fact store
        await memoryManager.recordValidatedDecision(
          cycleNumber, score,
          score.justification,
          ratchetResult.commitHash ?? ''
        );

        // Resolve blockers that were addressed
        const openBlockers = objectionTracker.getOpenBlockers();
        if (openBlockers.length > 0 && score.blockerCount === 0) {
          objectionTracker.resolveObjections(
            cycleNumber,
            openBlockers.map(b => b.id),
            `Resolved — COMMIT with no blockers (score: ${score.composite.toFixed(4)})`
          );
        }

        const committedEvt: OrchestratorEvent = {
          type: 'committed', newBest: runState.bestScore,
          delta, commitHash: ratchetResult.commitHash ?? '',
        };
        yield committedEvt;
        eventBus.broadcast(committedEvt);

      } else {
        runState.plateauCount++;
        runState.consecutiveRejects++;

        // Phase 3: Record failed experiment in fact store
        await memoryManager.recordFailedExperiment(
          cycleNumber, score,
          score.justification,
          score.justification
        );

        const revertedEvt: OrchestratorEvent = {
          type: 'reverted', score: score.composite, best: runState.bestScore,
        };
        yield revertedEvt;
        eventBus.broadcast(revertedEvt);
      }

      runState.totalCostUsd += cycleState.totalCostUsd;

      // ── MEMORY UPDATES ─────────────────────────────────────────────
      await memoryManager.updateIndexAfterCycle(
        cycleNumber, runState.bestScore, ratchetResult.decision, score.justification
      );
      await memoryManager.applyArchivistRecommendations(
        pipelineResult.archivistOutput.structuredData,
        cycleNumber, score, ratchetResult.decision
      );

      // Score history to DB
      const db = getDb();
      db.prepare(`INSERT OR REPLACE INTO score_history (run_id,cycle_number,composite,decision) VALUES (?,?,?,?)`)
        .run(runId, cycleNumber, score.composite, ratchetResult.decision);
      db.close();

      // Broadcast objection stats
      const objStats = objectionTracker.getStats();
      eventBus.broadcast({ type: 'objection_update', stats: objStats });

      // ── PHASE 3: FULL autoDream ────────────────────────────────────
      const { shouldDream, trigger } = shouldTriggerDream(
        cycleNumber,
        config.dreamInterval,
        runState.plateauCount,
        config.plateauCycles,
        memHealth,
        memoryManager.getLastDreamCycle()
      );

      if (shouldDream && featureFlag('fullAutoDream')) {
        const dreamStartEvt: OrchestratorEvent = { type: 'dream_start', cycleNumber };
        yield dreamStartEvt;
        eventBus.broadcast(dreamStartEvt);

        console.log(chalk.bold.magenta(`\n  💤 autoDream triggered [${trigger}]`));

        // After a successful dream run, update graph from facts (Phase 5)
        const activeFacts = memoryManager.getFactStore().getActiveFacts();
        await graphManager.updateFromFacts(activeFacts.slice(-25).map(f => f.statement));
        
        const dreamResult = await dreamEngine.dream(
          config, cycleNumber, trigger, scoreHistory
        );

        dreamRan = true;

        const dreamDoneEvt: any = {
          type:                  'dream_done',
          factsAdded:            dreamResult.factsExtracted,
          contradictionsRemoved: dreamResult.contradictionsResolved,
        };
        yield dreamDoneEvt;
        eventBus.broadcast({
          ...dreamDoneEvt,
          dreamReport:    dreamResult.dreamReport,
          qualityScore:   dreamResult.qualityScore,
          costUsd:        dreamResult.costUsd,
          durationMs:     dreamResult.durationMs,
          linesAfter:     dreamResult.memoryIndexLinesAfter,
        });

        console.log(chalk.magenta(
          `  💤 Dream complete: +${dreamResult.factsExtracted} facts, ` +
          `${dreamResult.contradictionsResolved} contradictions resolved, ` +
          `${dreamResult.memoryIndexLinesAfter} memory lines`
        ));
        console.log(chalk.italic.magenta(`  💤 ${dreamResult.dreamReport}`));

        // Update run best score in MEMORY.md after dream rewrites it
        const memContent = await memoryManager.readIndex();
        const updatedMem = memContent.replace(
          'Best score: [UPDATE FROM RUN STATE]',
          `Best score: ${runState.bestScore.toFixed(4)}`
        );
        if (updatedMem !== memContent) {
          const { writeFile: wf } = await import('node:fs/promises');
          await wf('./memory/MEMORY.md', updatedMem, 'utf-8');
        }

      } else if (featureFlag('autoDream') && cycleNumber % config.dreamInterval === 0) {
        // Fallback: Phase 1/2 stub dream if fullAutoDream not enabled
        const dreamStartEvt: OrchestratorEvent = { type: 'dream_start', cycleNumber };
        yield dreamStartEvt;
        await new Promise(r => setTimeout(r, 1000));
        dreamRan = true;
        const dreamDoneEvt: OrchestratorEvent = { type: 'dream_done', factsAdded: 0, contradictionsRemoved: 0 };
        yield dreamDoneEvt;
        eventBus.broadcast(dreamDoneEvt);
      }

      // ── Budget warning ─────────────────────────────────────────────
      if (featureFlag('maxCostGuard')) {
        const pct = runState.totalCostUsd / config.maxApiSpendUsd;
        if (pct >= 0.80) {
          const budgetEvt: OrchestratorEvent = {
            type: 'budget_warning',
            spent: runState.totalCostUsd,
            limit: config.maxApiSpendUsd,
          };
          yield budgetEvt;
          eventBus.broadcast(budgetEvt);
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
      const errorEvt: OrchestratorEvent = { type: 'error', message: errMsg, cycleNumber, fatal: false };
      yield errorEvt;
      eventBus.broadcast(errorEvt);
    }

    // ── Cycle complete ─────────────────────────────────────────────
    const durationMs = Date.now() - cycleStartMs;

    // ── Phase 9: Reflection & Strategic Pivoting ──────────────────
    if (featureFlag('processReflection') || featureFlag('strategicPivoting')) {
      const currentRunOutput = await Bun.file('./workspace/current_output.md').text().catch(() => '');
      
      // Generate Process Debt Report
      if (featureFlag('processReflection')) {
        await reflection.reflect({ cycleNumber, transcript: currentRunOutput });
      }

      // Check for Strategic Pivot
      if (featureFlag('strategicPivoting')) {
        const pivot = await pivoting.evaluatePivot({
          cycleNumber,
          scoreHistory: scoreHistory.map(s => s.score),
          currentOutput: currentRunOutput,
          objectives: weights
        });

        if (pivot?.status === 'auto_approved') {
          await pivoting.applyPivot(pivot.pivotId);
          console.log(chalk.bold.yellow(`  🚀 Auto-Applied Minor Pivot: ${pivot.pivotId}`));
        } else if (pivot?.status === 'pending') {
          console.log(chalk.bold.red(`  ⚠️   Major Strategic Pivot Proposed: ${pivot.pivotId}. Waiting for approval.`));
        }
      }
    }

    // ── Phase 10: Swarm Delegation ───────────────────────────────
    if (featureFlag('hierarchicalSwarm')) {
      const currentRunOutput = await Bun.file('./workspace/current_output.md').text().catch(() => '');
      const transcriptText = runState.cycleHistory.slice(-3).map((c: any) => c.action).join('\n');

      const delegation = await swarm.evaluateDelegation({
        cycle: cycleNumber,
        mission: config.mission,
        currentOutput: currentRunOutput,
        transcript: transcriptText
      });

      if (delegation) {
        console.log(chalk.bold.cyan(`  🐝 Swarm Delegation: Contract ${delegation.contractId} created with Specialist Org ${delegation.provider.runId}`));
        eventBus.broadcast({ 
          type: 'swarm_event', 
          message: `Delegated to Specialist Org for service: ${delegation.provider.serviceKey}` 
        });
      }
    }

    cycleState.endedAt = new Date();
    finalizeCycleInDb(cycleState.id, durationMs, cycleState.totalCostUsd, cycleState.totalTokens, proposalPath, dreamRan);
    updateRunProgress(runId, cycleNumber, runState.bestScore, runState.totalCostUsd);

    const factStats = memoryManager.getFactStore().getStats();
    console.log(chalk.gray(
      `\n  ✓ Cycle ${cycleNumber} — ${(durationMs / 1000).toFixed(1)}s | ` +
      `$${cycleState.totalCostUsd.toFixed(4)} | ${cycleState.totalTokens} tokens | ` +
      `Facts: ${factStats.active} (Δ${factStats.avgConfidence > 0 ? '+' : ''}${(factStats.avgConfidence * 100).toFixed(0)}% avg conf)`
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

  // ── Final dream (always run at end of session) ────────────────────
  if (featureFlag('fullAutoDream') && runState.cycleCount > 0) {
    console.log(chalk.magenta('\n  💤 Final session dream...'));
    try {
      await dreamEngine.dream(config, runState.cycleCount, 'manual', scoreHistory);
    } catch (err) {
      console.warn(chalk.yellow(`  ⚠  Final dream failed: ${err}`));
    }
  }

  const finalFacts = memoryManager.getFactStore().getStats();
  const finalObjs  = objectionTracker.getStats();

  console.log(chalk.bold.cyan(`\n╔══════════════════════════════════════╗`));
  console.log(chalk.bold.cyan(`║        AutoOrg Run Complete          ║`));
  console.log(chalk.bold.cyan(`╚══════════════════════════════════════╝`));
  console.log(chalk.white(`  Stop reason:   ${chalk.yellow(stopReason)}`));
  console.log(chalk.white(`  Total cycles:  ${chalk.green(runState.cycleCount)}`));
  console.log(chalk.white(`  Best score:    ${chalk.green(runState.bestScore.toFixed(4))}`));
  console.log(chalk.white(`  Total cost:    ${chalk.green('$' + runState.totalCostUsd.toFixed(4))}`));
  console.log(chalk.white(`  Facts stored:  ${chalk.cyan(finalFacts.active)} (${(finalFacts.avgConfidence * 100).toFixed(0)}% avg conf)`));
  console.log(chalk.white(`  Objections:    ${chalk.yellow(finalObjs.total)} raised, ${finalObjs.resolved} resolved`));

  const completeEvt: OrchestratorEvent = {
    type: 'run_complete', stopReason,
    finalBest: runState.bestScore, totalCycles: runState.cycleCount,
  };
  yield completeEvt;
  eventBus.broadcast(completeEvt);
}

/**
 * ── Phase 7: Benchmark Mode ──────────────────────────────────────────
 * Headless execution wrapper for benchmark attempts.
 */
export async function runBenchmarkMode(input: {
  orgText: string;
  constitutionText: string;
  caseConfig: Record<string, unknown>;
  templateVariant?: string;
  constitutionVariant?: string;
  modelMap?: Record<string, string>;
  seed?: number;
}) {
  // 1. Create a temporary org.md
  const tmpOrg = `./workspace/benchmarks/org_${nanoid(8)}.md`;
  await mkdir('./workspace/benchmarks', { recursive: true });
  await writeFile(tmpOrg, input.orgText, 'utf-8');

  // 2. Wrap the orchestrator loop
  let finalResult: any = {
    runId: '',
    finalOutputText: '',
    finalScore: { composite: 0, groundedness: 0, novelty: 0, consistency: 0, alignment: 0 },
    totalCostUsd: 0,
    totalToolCalls: 0,
    verificationReport: null,
    provenanceReport: null,
    securityFindingCount: 0,
  };

  const loop = orchestratorLoop(tmpOrg);
  for await (const evt of loop) {
    if (evt.type === 'run_start') {
      finalResult.runId = evt.runId;
    }
    if (evt.type === 'scored') {
      finalResult.finalScore = evt.score;
    }
    if (evt.type === 'run_complete') {
       // Read the final current_output.md
       try {
         const { readFile } = await import('node:fs/promises');
         finalResult.finalOutputText = await readFile('./workspace/current_output.md', 'utf-8');
       } catch { /* ignore */ }
    }
  }

  return finalResult;
}

// @ts-ignore - Expose for the benchmark runner
globalThis.__AUTOORG_BENCHMARK_RUNNER__ = runBenchmarkMode;
