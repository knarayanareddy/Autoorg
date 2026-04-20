import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { VariantCatalog } from './org-variant.js';
import { BranchStrategy } from './branch-strategy.js';
import { PortfolioPriors } from './priors.js';
import { PortfolioAllocator } from './allocator.js';
import { JudgeCouncil } from './judge-council.js';
import { BestOfNSynthesizer } from './best-of-n.js';
import { runBenchmarkMode } from '@/runtime/orchestrator.js';
import pLimit from 'p-limit';

export class PortfolioRunner {
  private variants = new VariantCatalog();
  private isolation = new BranchStrategy();
  private priors = new PortfolioPriors();

  async runMission(opts: {
    missionTitle: string;
    orgText: string;
    constitutionText: string;
    variantKeys: string[];
    initialBudgetUsd: number;
    roundLimit?: number;
  }) {
    const portfolioRunId = `pr_${nanoid(10)}`;
    const db = getDb();

    // 1. Initialize Portfolio Run
    db.prepare(`
      INSERT INTO portfolio_runs
      (id, mission_hash, mission_summary, mode, initial_budget_usd, remaining_budget_usd, round_limit)
      VALUES (?, ?, ?, 'mission', ?, ?, ?)
    `).run(
      portfolioRunId,
      'computed_hash', // replace with actual hash in production
      opts.missionTitle,
      opts.initialBudgetUsd,
      opts.initialBudgetUsd,
      opts.roundLimit ?? 3
    );

    // 2. Load and Prepare Variants
    const specs = await this.variants.loadByKeys(opts.variantKeys);
    for (const spec of specs) {
      const prior = this.priors.estimatePrior(spec);
      const { branchName, worktreePath } = await this.isolation.prepare({ 
        portfolioRunId, 
        variantKey: spec.variant_key 
      });

      db.prepare(`
        INSERT INTO portfolio_variants
        (id, portfolio_run_id, variant_key, display_name, constitution_variant, template_variant, 
         role_mix_json, model_map_json, branch_name, worktree_path, prior_score, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued')
      `).run(
        `pv_${nanoid(10)}`,
        portfolioRunId,
        spec.variant_key,
        spec.display_name,
        spec.constitution_variant,
        spec.template_variant,
        JSON.stringify(spec.role_mix),
        JSON.stringify(spec.model_map),
        branchName,
        worktreePath,
        prior.prior_score
      );
    }
    db.close();

    const allocator = new PortfolioAllocator(portfolioRunId);
    const council = new JudgeCouncil(portfolioRunId);
    const synthesizer = new BestOfNSynthesizer(portfolioRunId);

    // 3. Round Loop
    for (let r = 1; r <= (opts.roundLimit ?? 3); r++) {
      const roundId = `round_${nanoid(8)}`;
      const db2 = getDb();
      db2.prepare(`INSERT INTO portfolio_rounds (id, portfolio_run_id, round_number) VALUES (?, ?, ?)`).run(roundId, portfolioRunId, r);
      db2.close();

      // Allocate Budget for this round
      const db3 = getDb();
      const run = db3.prepare(`SELECT remaining_budget_usd FROM portfolio_runs WHERE id = ?`).get(portfolioRunId) as { remaining_budget_usd: number };
      db3.close();
      
      await allocator.rebalance({ roundId, remainingBudgetUsd: run.remaining_budget_usd });

      // Run Survivors in Parallel
      const db4 = getDb();
      const activeVariants = db4.prepare(`SELECT * FROM portfolio_variants WHERE portfolio_run_id = ? AND status != 'eliminated'`).all(portfolioRunId) as any[];
      db4.close();

      const limit = pLimit(3);
      const variantTasks = activeVariants.map(v => limit(async () => {
         // Headless execution using the hook
         // Note: in a real implementation, we would switch to the worktree and the cloned DB
         const result = await runBenchmarkMode({
           orgText: opts.orgText,
           constitutionText: opts.constitutionText,
           caseConfig: { max_cycles: 2 },
           modelMap: JSON.parse(v.model_map_json),
         });

         const dbV = getDb();
         dbV.prepare(`INSERT INTO portfolio_variant_runs (id, portfolio_round_id, variant_id, autoorg_run_id, status, score) VALUES (?, ?, ?, ?, 'completed', ?)`).run(
           `pvr_${nanoid(10)}`, roundId, v.id, result.runId, result.finalScore.composite
         );
         dbV.prepare(`UPDATE portfolio_variants SET latest_score = ? WHERE id = ?`).run(result.finalScore.composite, v.id);
         dbV.close();

         return { id: v.id, key: v.variant_key, text: result.finalOutputText };
      }));

      const roundOutputs = await Promise.all(variantTasks);

      // Council Voting
      await council.vote({ roundId, variantOutputs: roundOutputs });

      // Final Round? Synthesize
      if (r === (opts.roundLimit ?? 3)) {
        await synthesizer.synthesize({ roundId, survivors: roundOutputs });
      }
    }

    return { portfolioRunId };
  }
}
