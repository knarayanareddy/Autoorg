TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { BenchmarkRunner } from '@/evals/benchmark-runner.js';

export class ConstitutionAB {
  private runner = new BenchmarkRunner();

  async compare(opts: {
    suiteName: string;
    variantA: string;
    variantB: string;
    modelMap?: Record<string, string>;
    templateVariant?: string;
  }) {
    const runA = await this.runner.runSuite({
      suiteName: opts.suiteName,
      mode: 'ab_test',
      constitutionVariant: opts.variantA,
      templateVariant: opts.templateVariant,
      modelMap: opts.modelMap,
      runLabel: `${opts.suiteName}-A`,
    });

    const runB = await this.runner.runSuite({
      suiteName: opts.suiteName,
      mode: 'ab_test',
      constitutionVariant: opts.variantB,
      templateVariant: opts.templateVariant,
      modelMap: opts.modelMap,
      runLabel: `${opts.suiteName}-B`,
    });

    const db = getDb();

    const suiteRow = db.prepare(`SELECT id FROM benchmark_suites WHERE suite_name = ?`).get(opts.suiteName) as { id: string };

    const avg = (benchmarkRunId: string) => db.prepare(`
      SELECT
        AVG(bm.score) as avg_score,
        AVG(bm.policy_compliance) as avg_policy,
        AVG(bm.cost_usd) as avg_cost
      FROM benchmark_metrics bm
      JOIN benchmark_attempts ba ON ba.id = bm.attempt_id
      WHERE ba.benchmark_run_id = ?
    `).get(benchmarkRunId) as any;

    const a = avg(runA.benchmarkRunId);
    const b = avg(runB.benchmarkRunId);

    const winner =
      (b.avg_score + 0.15 * b.avg_policy - 0.03 * b.avg_cost) >
      (a.avg_score + 0.15 * a.avg_policy - 0.03 * a.avg_cost)
        ? opts.variantB
        : opts.variantA;

    db.prepare(`
      INSERT INTO constitution_experiments
      (id, suite_id, experiment_name, variant_a, variant_b, winner, delta_score, delta_policy, delta_cost, artifact_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `cab_${nanoid(10)}`,
      suiteRow.id,
      `${opts.suiteName}:${opts.variantA}_vs_${opts.variantB}`,
      opts.variantA,
      opts.variantB,
      winner,
      (b.avg_score ?? 0) - (a.avg_score ?? 0),
      (b.avg_policy ?? 0) - (a.avg_policy ?? 0),
      (b.avg_cost ?? 0) - (a.avg_cost ?? 0),
      null
    );

    db.close();

    return {
      winner,
      runA: runA.benchmarkRunId,
      runB: runB.benchmarkRunId,
    };
  }
}
13. Template bake-offs