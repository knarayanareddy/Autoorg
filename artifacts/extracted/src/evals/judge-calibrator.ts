TypeScript

import { nanoid } from 'nanoid';
import { variance, mean } from '@/evals/metrics.js';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';
import { JUDGE_CALIBRATOR_SYSTEM_PROMPT, JudgeCalibrationSchema } from '@/prompts/judge-calibrator.js';

export class JudgeCalibrator {
  private artifacts = new ImmutableArtifacts();

  async calibrate(opts: {
    benchmarkRunId: string;
    judgeModel?: string;
  }) {
    const db = getDb();
    const rows = db.prepare(`
      SELECT
        ba.id as attempt_id,
        bm.score, bm.groundedness, bm.novelty, bm.consistency, bm.mission_alignment, bm.policy_compliance
      FROM benchmark_metrics bm
      JOIN benchmark_attempts ba ON ba.id = bm.attempt_id
      WHERE ba.benchmark_run_id = ?
      ORDER BY ba.created_at ASC
      LIMIT 50
    `).all(opts.benchmarkRunId) as Array<any>;
    db.close();

    // Baseline Phase 7 version: variance is estimated from repeated score recomputations stubbed here.
    const repeated = rows.map(row => ({
      attemptId: row.attempt_id,
      scores: [
        row.score,
        row.score,
        row.score,
      ],
      groundedness: [
        row.groundedness,
        row.groundedness,
        row.groundedness,
      ],
      policy: [
        row.policy_compliance,
        row.policy_compliance,
        row.policy_compliance,
      ],
    }));

    const variances = repeated.map(r => variance(r.scores));
    const unstableCases = repeated
      .filter(r => variance(r.scores) > 0.01 || variance(r.groundedness) > 0.01 || variance(r.policy) > 0.01)
      .map(r => r.attemptId);

    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const report = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: JUDGE_CALIBRATOR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            benchmarkRunId: opts.benchmarkRunId,
            repeated,
            meanVariance: mean(variances),
          }, null, 2),
        },
      ],
      schema: JudgeCalibrationSchema,
    });

    const written = await this.artifacts.writeJson({
      runId: opts.benchmarkRunId,
      relPath: `artifacts/benchmarks/calibrations/${opts.benchmarkRunId}.json`,
      data: report,
      artifactKind: 'judge_calibration',
    });

    const db2 = getDb();
    db2.prepare(`
      INSERT INTO judge_calibration_runs
      (id, benchmark_run_id, judge_model, sample_count, mean_variance, agreement_score, artifact_path, report_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `jcr_${nanoid(10)}`,
      opts.benchmarkRunId,
      opts.judgeModel ?? 'default',
      rows.length,
      report.mean_variance,
      report.agreement_score,
      written.artifactPath,
      JSON.stringify(report),
    );
    db2.close();

    return report;
  }
}
16. Benchmark CI entrypoint