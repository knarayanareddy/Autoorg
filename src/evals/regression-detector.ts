import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { REGRESSION_EXPLAINER_SYSTEM_PROMPT, RegressionExplanationSchema } from '@/prompts/regression-explainer.js';

export class RegressionDetector {
  async scanRun(benchmarkRunId: string) {
    const db = getDb();

    const run = db.prepare(`
      SELECT * FROM benchmark_runs WHERE id = ?
    `).get(benchmarkRunId) as any;

    if (!run) {
      db.close();
      return [];
    }

    // Find previous completed run of same suite
    const baseline = db.prepare(`
      SELECT *
      FROM benchmark_runs
      WHERE suite_id = ? AND status = 'completed' AND id != ?
      ORDER BY started_at DESC
      LIMIT 1
    `).get(run.suite_id, benchmarkRunId) as any;

    if (!baseline) {
      db.close();
      return [];
    }

    const currentMetrics = db.prepare(`
      SELECT
        AVG(bm.score) as avg_score,
        AVG(bm.groundedness) as avg_groundedness,
        AVG(bm.gold_match) as avg_gold,
        AVG(bm.cost_usd) as avg_cost,
        AVG(bm.latency_ms) as avg_latency
      FROM benchmark_metrics bm
      JOIN benchmark_attempts ba ON ba.id = bm.attempt_id
      WHERE ba.benchmark_run_id = ?
    `).get(benchmarkRunId) as any;

    const baselineMetrics = db.prepare(`
      SELECT
        AVG(bm.score) as avg_score,
        AVG(bm.groundedness) as avg_groundedness,
        AVG(bm.gold_match) as avg_gold,
        AVG(bm.cost_usd) as avg_cost,
        AVG(bm.latency_ms) as avg_latency
      FROM benchmark_metrics bm
      JOIN benchmark_attempts ba ON ba.id = bm.attempt_id
      WHERE ba.benchmark_run_id = ?
    `).get(baseline.id) as any;

    const deltas = [
      ['score', baselineMetrics.avg_score, currentMetrics.avg_score, -0.05], // 5% drop
      ['groundedness', baselineMetrics.avg_groundedness, currentMetrics.avg_groundedness, -0.05],
      ['gold_match', baselineMetrics.avg_gold, currentMetrics.avg_gold, -0.10],
      ['cost_usd', baselineMetrics.avg_cost, currentMetrics.avg_cost, +0.20], // 20% increase
      ['latency_ms', baselineMetrics.avg_latency, currentMetrics.avg_latency, +0.25],
    ] as const;

    const alarms = [];

    for (const [metricName, bVal, cVal, threshold] of deltas) {
      const delta = (cVal ?? 0) - (bVal ?? 0);
      const isRegression = (metricName === 'cost_usd' || metricName === 'latency_ms')
        ? delta > (threshold as number)
        : delta < (threshold as number);

      if (!isRegression) continue;

      const adapter = getAdapter({
        provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
        model: 'claude-sonnet-4-5',
      });

      const explanation = await adapter.structured({
        model: 'claude-sonnet-4-5',
        messages: [
          { role: 'system', content: REGRESSION_EXPLAINER_SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              metricName,
              baselineValue: bVal,
              currentValue: cVal,
              deltaValue: delta,
              thresholdValue: threshold,
              category: 'general'
            }, null, 2),
          },
        ],
        schema: RegressionExplanationSchema,
      });

      db.prepare(`
        INSERT INTO regression_alarms
        (id, benchmark_run_id, subject_key, metric_name, baseline_value, current_value, delta_value, threshold_value, severity, explanation_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `ra_${nanoid(10)}`,
        benchmarkRunId,
        'overall',
        metricName,
        bVal ?? 0,
        cVal ?? 0,
        delta,
        threshold,
        'warn', // As requested: warning for now
        JSON.stringify(explanation)
      );

      alarms.push({ metricName, explanation });
    }

    db.close();
    return alarms;
  }
}
