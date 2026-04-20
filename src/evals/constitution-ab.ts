import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { BenchmarkRunner } from './benchmark-runner.js';

export class ConstitutionAB {
  private runner = new BenchmarkRunner();

  async compare(opts: {
    suiteName: string;
    variantA: string;
    variantB: string;
    modelMap?: Record<string, string>;
    templateVariant?: string;
  }) {
    // Run Variant A
    const runA = await this.runner.runSuite({
      suiteName: opts.suiteName,
      mode: 'ab_test',
      constitutionVariant: opts.variantA,
      templateVariant: opts.templateVariant,
      modelMap: opts.modelMap,
      runLabel: `${opts.suiteName}-A-${opts.variantA}`,
    });

    // Run Variant B
    const runB = await this.runner.runSuite({
      suiteName: opts.suiteName,
      mode: 'ab_test',
      constitutionVariant: opts.variantB,
      templateVariant: opts.templateVariant,
      modelMap: opts.modelMap,
      runLabel: `${opts.suiteName}-B-${opts.variantB}`,
    });

    const db = getDb();
    
    // Aggregation and decision logic
    const avg = (runId: string) => db.prepare(`
      SELECT
        AVG(bm.score) as avg_score,
        AVG(bm.gold_match) as avg_gold,
        AVG(bm.cost_usd) as avg_cost
      FROM benchmark_metrics bm
      JOIN benchmark_attempts ba ON ba.id = bm.attempt_id
      WHERE ba.benchmark_run_id = ?
    `).get(runId) as any;

    const statsA = avg(runA.benchmarkRunId);
    const statsB = avg(runB.benchmarkRunId);

    // Decision factor: Score improved AND gold match stable/improved
    const winner = (statsB.avg_score > statsA.avg_score) ? opts.variantB : opts.variantA;

    db.close();

    return {
      winner,
      runA: runA.benchmarkRunId,
      runB: runB.benchmarkRunId,
      statsA,
      statsB
    };
  }
}
