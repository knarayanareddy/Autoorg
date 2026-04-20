TypeScript

import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { VariantCatalog } from '@/portfolio/org-variant.js';
import { BranchStrategy } from '@/portfolio/branch-strategy.js';
import { PortfolioAllocator } from '@/portfolio/allocator.js';
import { JudgeCouncil } from '@/portfolio/judge-council.js';
import { Tournament } from '@/portfolio/tournament.js';
import { BestOfN } from '@/portfolio/best-of-n.js';
import { FailureContainment } from '@/portfolio/failure-containment.js';
import { PortfolioPriors } from '@/portfolio/priors.js';

function missionHash(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

export class PortfolioRunner {
  private variants = new VariantCatalog();
  private branches = new BranchStrategy();
  private priors = new PortfolioPriors();

  async run(opts: {
    missionText: string;
    variantKeys?: string[];
    mode?: 'mission' | 'benchmark_seeded' | 'tournament';
    initialBudgetUsd: number;
    roundLimit?: number;
    topKSurvive?: number;
  }) {
    const specs = await this.variants.loadByKeys(opts.variantKeys);

    const portfolioRunId = `pr_${nanoid(10)}`;
    const db = getDb();

    db.prepare(`
      INSERT INTO portfolio_runs
      (id, mission_hash, mission_summary, mode, initial_budget_usd, remaining_budget_usd, round_limit, top_k_survive, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running')
    `).run(
      portfolioRunId,
      missionHash(opts.missionText),
      opts.missionText.slice(0, 600),
      opts.mode ?? 'mission',
      opts.initialBudgetUsd,
      opts.initialBudgetUsd,
      opts.roundLimit ?? 3,
      opts.topKSurvive ?? 2,
    );
    db.close();

    for (const spec of specs) {
      const worktree = await this.branches.prepare({
        portfolioRunId,
        variantKey: spec.variant_key,
      });

      const prior = this.priors.estimatePrior(spec);

      const db2 = getDb();
      db2.prepare(`
        INSERT INTO portfolio_variants
        (id, portfolio_run_id, variant_key, display_name, constitution_variant, template_variant,
         role_mix_json, model_map_json, branch_name, worktree_path, prior_score, allocated_budget_usd, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued')
      `).run(
        `pv_${nanoid(10)}`,
        portfolioRunId,
        spec.variant_key,
        spec.display_name,
        spec.constitution_variant,
        spec.template_variant,
        JSON.stringify(spec.role_mix),
        JSON.stringify(spec.model_map),
        worktree.branchName,
        worktree.worktreePath,
        prior.prior_score,
        0
      );
      db2.close();
    }

    const allocator = new PortfolioAllocator(portfolioRunId);
    const council = new JudgeCouncil(portfolioRunId);
    const tournament = new Tournament(portfolioRunId);
    const synth = new BestOfN(portfolioRunId);
    const containment = new FailureContainment(portfolioRunId);

    let remainingBudget = opts.initialBudgetUsd;
    let survivingVariantIds: string[] = [];

    for (let round = 1; round <= (opts.roundLimit ?? 3); round++) {
      const roundId = `prd_${nanoid(10)}`;
      const db3 = getDb();

      db3.prepare(`
        INSERT INTO portfolio_rounds
        (id, portfolio_run_id, round_number, status, objective_snapshot_json)
        VALUES (?, ?, ?, 'running', ?)
      `).run(
        roundId,
        portfolioRunId,
        round,
        JSON.stringify({
          missionSummary: opts.missionText.slice(0, 500),
          remainingBudget,
        })
      );

      db3.close();

      const rebalance = await allocator.rebalance({
        roundId,
        remainingBudgetUsd: remainingBudget,
      });

      const db4 = getDb();
      const active = db4.prepare(`
        SELECT * FROM portfolio_variants
        WHERE portfolio_run_id = ?
          AND status NOT IN ('eliminated','failed','quarantined')
          AND allocated_budget_usd > 0
        ORDER BY allocated_budget_usd DESC
      `).all(portfolioRunId) as Array<any>;
      db4.close();

      const results = await Promise.allSettled(
        active.map(v => this.runVariantRound({
          portfolioRunId,
          roundId,
          missionText: opts.missionText,
          variant: v,
        }))
      );

      const completed = [];
      for (let i = 0; i < results.length; i++) {
        const variant = active[i];
        const result = results[i];

        if (result.status === 'rejected') {
          containment.record({
            variantId: variant.id,
            severity: 'error',
            category: 'crash_loop',
            summary: `Variant round failed`,
            details: { error: String(result.reason) },
          });
          containment.eliminateVariant(variant.id, 'round execution failed');
          continue;
        }

        completed.push(result.value);

        if (containment.shouldKill({
          spentBudgetUsd: result.value.costUsd,
          allocatedBudgetUsd: variant.allocated_budget_usd,
          securityFindings: result.value.securityFindingCount ?? 0,
          criticalPolicyFailure: (result.value.policyCompliance ?? 1) < 0.6,
        })) {
          containment.quarantineVariant(variant.id, 'unsafe or over-budget');
        }
      }

      const living = completed
        .filter(x => !x.quarantined)
        .sort((a, b) =>
          (b.score.composite + 0.12 * (b.score.policyCompliance ?? 1) - 0.02 * b.costUsd) -
          (a.score.composite + 0.12 * (a.score.policyCompliance ?? 1) - 0.02 * a.costUsd)
        );

      survivingVariantIds = living
        .slice(0, opts.topKSurvive ?? 2)
        .map(x => x.variantId);

      const councilResult = await council.voteOnVariants({
        roundId,
        variants: living.slice(0, Math.max(2, opts.topKSurvive ?? 2)).map(v => ({
          variantId: v.variantId,
          displayName: v.displayName,
          outputText: v.outputText,
          metrics: {
            score: v.score.composite,
            groundedness: v.score.groundedness,
            policyCompliance: v.score.policyCompliance ?? 1,
            costUsd: v.costUsd,
          },
        })),
      });

      if ((opts.mode ?? 'mission') === 'tournament' && living.length >= 2) {
        const winners = await tournament.runRound({
          roundId,
          variants: living.slice(0, 4).map(v => ({
            variantId: v.variantId,
            displayName: v.displayName,
            outputText: v.outputText,
            metrics: {
              score: v.score.composite,
              policyCompliance: v.score.policyCompliance ?? 1,
            },
          })),
        });

        survivingVariantIds = winners;
      }

      remainingBudget = Math.max(
        0,
        remainingBudget - living.reduce((acc, x) => acc + x.costUsd, 0)
      );

      const db5 = getDb();
      db5.prepare(`
        UPDATE portfolio_rounds
        SET status = 'completed', finished_at = datetime('now')
        WHERE id = ?
      `).run(roundId);

      db5.prepare(`
        UPDATE portfolio_runs
        SET remaining_budget_usd = ?
        WHERE id = ?
      `).run(remainingBudget, portfolioRunId);
      db5.close();

      if (survivingVariantIds.length <= 1 || remainingBudget <= 0.1) break;
    }

    const finalists = await this.loadVariantOutputs(portfolioRunId, survivingVariantIds);
    const synthesis = await synth.synthesize({
      variants: finalists.map(v => ({
        variantId: v.variantId,
        displayName: v.displayName,
        outputText: v.outputText,
        metrics: v.metrics,
      })),
    });

    const winnerVariantId = finalists[0]?.variantId ?? null;

    const db6 = getDb();
    if (winnerVariantId) {
      db6.prepare(`
        UPDATE portfolio_variants
        SET status = 'winner', updated_at = datetime('now')
        WHERE id = ?
      `).run(winnerVariantId);
    }

    db6.prepare(`
      UPDATE portfolio_runs
      SET status = 'completed',
          final_variant_id = ?,
          final_artifact_path = ?,
          finished_at = datetime('now'),
          summary_json = ?
      WHERE id = ?
    `).run(
      winnerVariantId,
      synthesis.artifactPath,
      JSON.stringify({
        survivingVariantIds,
        synthesisId: synthesis.synthesisId,
      }),
      portfolioRunId
    );
    db6.close();

    return {
      portfolioRunId,
      synthesisArtifactPath: synthesis.artifactPath,
      winnerVariantId,
    };
  }

  private async runVariantRound(opts: {
    portfolioRunId: string;
    roundId: string;
    missionText: string;
    variant: any;
  }) {
    const runId = `pvr_${nanoid(10)}`;

    const result = await runPortfolioChild({
      worktreePath: opts.variant.worktree_path,
      missionText: opts.missionText,
      variant: {
        variantId: opts.variant.id,
        variantKey: opts.variant.variant_key,
        constitutionVariant: opts.variant.constitution_variant,
        templateVariant: opts.variant.template_variant,
        modelMap: JSON.parse(opts.variant.model_map_json || '{}'),
      },
      budgetUsd: opts.variant.allocated_budget_usd,
    });

    const db = getDb();
    db.prepare(`
      INSERT INTO portfolio_variant_runs
      (id, portfolio_round_id, variant_id, autoorg_run_id, status, output_path, evidence_pack_id, report_path,
       score, groundedness, novelty, consistency, mission_alignment, policy_compliance, cost_usd, latency_ms,
       tool_calls, security_findings, unsupported_claims, broken_provenance_links, finished_at)
      VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      runId,
      opts.roundId,
      opts.variant.id,
      result.runId ?? null,
      result.outputPath ?? null,
      result.evidencePackId ?? null,
      result.reportPath ?? null,
      result.score.composite,
      result.score.groundedness,
      result.score.novelty,
      result.score.consistency,
      result.score.missionAlignment,
      result.score.policyCompliance ?? 1,
      result.costUsd ?? 0,
      result.latencyMs ?? 0,
      result.toolCalls ?? 0,
      result.securityFindingCount ?? 0,
      result.verificationReport?.unsupported_claims ?? 0,
      result.provenanceReport?.broken_links ?? 0
    );

    db.prepare(`
      UPDATE portfolio_variants
      SET status = 'completed',
          spent_budget_usd = spent_budget_usd + ?,
          latest_score = ?,
          latest_groundedness = ?,
          latest_policy_compliance = ?,
          latest_cost_usd = ?,
          latest_latency_ms = ?,
          latest_autoorg_run_id = ?,
          latest_output_path = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      result.costUsd ?? 0,
      result.score.composite,
      result.score.groundedness,
      result.score.policyCompliance ?? 1,
      result.costUsd ?? 0,
      result.latencyMs ?? 0,
      result.runId ?? null,
      result.outputPath ?? null,
      opts.variant.id
    );

    db.close();

    return {
      variantId: opts.variant.id,
      displayName: opts.variant.display_name,
      outputText: result.outputText,
      outputPath: result.outputPath,
      evidencePackId: result.evidencePackId,
      score: result.score,
      costUsd: result.costUsd ?? 0,
      latencyMs: result.latencyMs ?? 0,
      securityFindingCount: result.securityFindingCount ?? 0,
      policyCompliance: result.score.policyCompliance ?? 1,
      quarantined: false,
    };
  }

  private async loadVariantOutputs(portfolioRunId: string, variantIds: string[]) {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, display_name, latest_output_path, latest_score, latest_groundedness, latest_policy_compliance, latest_cost_usd
      FROM portfolio_variants
      WHERE portfolio_run_id = ?
        AND id IN (${variantIds.map(() => '?').join(',')})
      ORDER BY latest_score DESC
    `).all(portfolioRunId, ...variantIds) as Array<any>;
    db.close();

    const out = [];
    for (const row of rows) {
      const outputText = row.latest_output_path
        ? await Bun.file(row.latest_output_path).text().catch(() => '')
        : '';
      out.push({
        variantId: row.id,
        displayName: row.display_name,
        outputText,
        metrics: {
          score: row.latest_score,
          groundedness: row.latest_groundedness,
          policyCompliance: row.latest_policy_compliance,
          costUsd: row.latest_cost_usd,
        },
      });
    }
    return out;
  }
}

async function runPortfolioChild(input: any) {
  if (typeof globalThis.__AUTOORG_PORTFOLIO_CHILD__ === 'function') {
    return await globalThis.__AUTOORG_PORTFOLIO_CHILD__(input);
  }
  throw new Error('No portfolio child runner wired');
}
18. Orchestrator portfolio mode
Phase 8 should reuse the real orchestrator, just with variant-specific parameters and worktree isolation.

Patch src/runtime/orchestrator.ts
Add:

TypeScript

export async function runPortfolioChildMode(input: {
  worktreePath: string;
  missionText: string;
  variant: {
    variantId: string;
    variantKey: string;
    constitutionVariant: string;
    templateVariant: string;
    modelMap: Record<string, string>;
  };
  budgetUsd: number;
}) {
  const started = Date.now();

  const result = await runAutoOrg({
    orgText: input.missionText,
    mode: 'portfolio',
    workspaceRoot: input.worktreePath,
    constitutionVariant: input.variant.constitutionVariant,
    templateVariant: input.variant.templateVariant,
    modelMap: input.variant.modelMap,
    maxBudgetUsd: input.budgetUsd,
    portfolioVariantId: input.variant.variantId,
  });

  return {
    runId: result.runId,
    outputText: result.finalOutputText,
    outputPath: result.finalOutputPath,
    evidencePackId: result.evidencePackId,
    reportPath: result.reportPath,
    score: result.finalScore,
    costUsd: result.totalCostUsd ?? 0,
    latencyMs: Date.now() - started,
    toolCalls: result.totalToolCalls ?? 0,
    verificationReport: result.verificationReport,
    provenanceReport: result.provenanceReport,
    securityFindingCount: result.securityFindingCount ?? 0,
  };
}

(globalThis as any).__AUTOORG_PORTFOLIO_CHILD__ = runPortfolioChildMode;
This keeps Phase 8 grounded in the same runtime stack as earlier phases.

19. Cross-org exchange trigger
A simple first integration:

only allow exchange from top-performing variants,
only share evidence packs or plans,
only after quarantine.
Patch src/portfolio/portfolio-runner.ts
After council result, optionally share the winner’s evidence summary to the runner-up:

TypeScript

import { ExchangeBus } from '@/portfolio/exchange-bus.js';

const exchangeBus = new ExchangeBus(portfolioRunId);

if (living.length >= 2 && living[0].evidencePackId) {
  const dbx = getDb();
  const pack = dbx.prepare(`
    SELECT artifact_path
    FROM evidence_packs
    WHERE id = ?
  `).get(living[0].evidencePackId) as { artifact_path: string } | undefined;
  dbx.close();

  if (pack?.artifact_path) {
    await exchangeBus.send({
      fromVariantId: living[0].variantId,
      toVariantId: living[1].variantId,
      artifactPath: pack.artifact_path,
      exchangeType: 'evidence',
    });
  }
}
This gives you “cross-org learning” without uncontrolled memory sharing.

20. API routes