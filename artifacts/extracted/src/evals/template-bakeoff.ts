TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { BenchmarkRunner } from '@/evals/benchmark-runner.js';

export class TemplateBakeoff {
  private runner = new BenchmarkRunner();

  async compare(opts: {
    suiteName: string;
    templateA: string;
    templateB: string;
    constitutionVariant?: string;
    modelMap?: Record<string, string>;
  }) {
    const a = await this.runner.runSuite({
      suiteName: opts.suiteName,
      mode: 'bakeoff',
      templateVariant: opts.templateA,
      constitutionVariant: opts.constitutionVariant,
      modelMap: opts.modelMap,
      runLabel: `${opts.suiteName}-${opts.templateA}`,
    });

    const b = await this.runner.runSuite({
      suiteName: opts.suiteName,
      mode: 'bakeoff',
      templateVariant: opts.templateB,
      constitutionVariant: opts.constitutionVariant,
      modelMap: opts.modelMap,
      runLabel: `${opts.suiteName}-${opts.templateB}`,
    });

    const db = getDb();
    const suiteRow = db.prepare(`SELECT id FROM benchmark_suites WHERE suite_name = ?`).get(opts.suiteName) as { id: string };

    const stats = (benchmarkRunId: string) => db.prepare(`
      SELECT
        AVG(bm.score) as avg_score,
        AVG(bm.cost_usd) as avg_cost,
        AVG(bm.latency_ms) as avg_latency
      FROM benchmark_metrics bm
      JOIN benchmark_attempts ba ON ba.id = bm.attempt_id
      WHERE ba.benchmark_run_id = ?
    `).get(benchmarkRunId) as any;

    const sa = stats(a.benchmarkRunId);
    const sb = stats(b.benchmarkRunId);

    const winner =
      (sb.avg_score ?? 0) - 0.02 * (sb.avg_cost ?? 0) / 10 - 0.01 * (sb.avg_latency ?? 0) / 10000 >
      (sa.avg_score ?? 0) - 0.02 * (sa.avg_cost ?? 0) / 10 - 0.01 * (sa.avg_latency ?? 0) / 10000
        ? opts.templateB
        : opts.templateA;

    db.prepare(`
      INSERT INTO template_bakeoffs
      (id, suite_id, template_a, template_b, winner, delta_score, delta_cost, delta_latency, artifact_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `tb_${nanoid(10)}`,
      suiteRow.id,
      opts.templateA,
      opts.templateB,
      winner,
      (sb.avg_score ?? 0) - (sa.avg_score ?? 0),
      (sb.avg_cost ?? 0) - (sa.avg_cost ?? 0),
      (sb.avg_latency ?? 0) - (sa.avg_latency ?? 0),
      null
    );

    db.close();

    return { winner, runA: a.benchmarkRunId, runB: b.benchmarkRunId };
  }
}
14. Judge calibration prompt