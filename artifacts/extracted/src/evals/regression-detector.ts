TypeScript

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

    const currentRows = db.prepare(`
      SELECT
        AVG(bm.score) as avg_score,
        AVG(bm.groundedness) as avg_groundedness,
        AVG(bm.novelty) as avg_novelty,
        AVG(bm.policy_compliance) as avg_policy,
        AVG(bm.cost_usd) as avg_cost,
        AVG(bm.latency_ms) as avg_latency,
        AVG(bm.gold_match) as avg_gold
      FROM benchmark_metrics bm
      JOIN benchmark_attempts ba ON ba.id = bm.attempt_id
      WHERE ba.benchmark_run_id = ?
    `).get(benchmarkRunId) as any;

    const baselineRows = db.prepare(`
      SELECT
        AVG(bm.score) as avg_score,
        AVG(bm.groundedness) as avg_groundedness,
        AVG(bm.novelty) as avg_novelty,
        AVG(bm.policy_compliance) as avg_policy,
        AVG(bm.cost_usd) as avg_cost,
        AVG(bm.latency_ms) as avg_latency,
        AVG(bm.gold_match) as avg_gold
      FROM benchmark_metrics bm
      JOIN benchmark_attempts ba ON ba.id = bm.attempt_id
      WHERE ba.benchmark_run_id = ?
    `).get(baseline.id) as any;

    const deltas = [
      ['score', baselineRows.avg_score, currentRows.avg_score, -0.03],
      ['groundedness', baselineRows.avg_groundedness, currentRows.avg_groundedness, -0.04],
      ['gold_match', baselineRows.avg_gold, currentRows.avg_gold, -0.04],
      ['policy_compliance', baselineRows.avg_policy, currentRows.avg_policy, -0.03],
      ['cost_usd', baselineRows.avg_cost, currentRows.avg_cost, +0.20],
      ['latency_ms', baselineRows.avg_latency, currentRows.avg_latency, +0.25],
    ] as const;

    const alarms = [];

    for (const [metricName, baselineValue, currentValue, threshold] of deltas) {
      const deltaValue = (currentValue ?? 0) - (baselineValue ?? 0);

      const isRegression =
        metricName === 'cost_usd' || metricName === 'latency_ms'
          ? deltaValue > threshold
          : deltaValue < threshold;

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
              baselineRun: baseline.id,
              currentRun: benchmarkRunId,
              baselineValue,
              currentValue,
              deltaValue,
            }, null, 2),
          },
        ],
        schema: RegressionExplanationSchema,
      });

      const severity =
        metricName === 'policy_compliance' || metricName === 'groundedness'
          ? 'error'
          : metricName === 'score'
            ? 'error'
            : 'warn';

      db.prepare(`
        INSERT INTO regression_alarms
        (id, benchmark_run_id, subject_key, metric_name, baseline_value, current_value, delta_value, threshold_value, severity, explanation_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `ra_${nanoid(10)}`,
        benchmarkRunId,
        'overall',
        metricName,
        baselineValue ?? 0,
        currentValue ?? 0,
        deltaValue,
        threshold,
        severity,
        JSON.stringify(explanation),
      );

      alarms.push({ metricName, severity, explanation });
    }

    db.close();
    return alarms;
  }
}
11. Offline replay lab