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
import { memoryManager }       from './memory-manager.js';
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

    // Phase 4: Run graph grounding validation
    const groundingResult = await memoryManager.validateClaimGrounding(proposal);
    const groundingReport = [
      `Graph Grounding Score: ${groundingResult.score.toFixed(2)}`,
      `Supporting Nodes: ${groundingResult.supportingNodes.map(n => n.label).join(', ')}`,
      `Supporting Edges: ${groundingResult.supportingEdges.length}`,
      `Explanation: ${groundingResult.explanation}`,
    ].join('\n');

    const { runRatchetJudge } = await import('./agent-runner.js');
    const judgeOutput = await runRatchetJudge(
      ctx, proposal, criticOutput, 
      `${seedMaterialSummary}\n\n### KNOWLEDGE GRAPH GROUNDING REPORT:\n${groundingReport}`
    );

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
