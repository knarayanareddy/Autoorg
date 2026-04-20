TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { BenchmarkRunner } from '@/evals/benchmark-runner.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';

export class Simulator {
  private benchmarks = new BenchmarkRunner();
  private artifacts = new ImmutableArtifacts();

  async simulate(opts: {
    proposalId: string;
    suiteName: string;
    candidateOverrides: Record<string, unknown>;
    baselineLabel?: string;
  }) {
    const simulationId = `sim_${nanoid(10)}`;
    const db = getDb();

    db.prepare(`
      INSERT INTO simulation_runs
      (id, proposal_id, suite_name, status, delta_json)
      VALUES (?, ?, ?, 'running', '{}')
    `).run(simulationId, opts.proposalId, opts.suiteName);
    db.close();

    try {
      const baseline = await this.benchmarks.runSuite({
        suiteName: opts.suiteName,
        mode: 'manual',
        runLabel: `${opts.baselineLabel ?? 'baseline'}-${Date.now()}`,
      });

      const candidate = await this.benchmarks.runSuite({
        suiteName: opts.suiteName,
        mode: 'manual',
        runLabel: `candidate-${Date.now()}`,
        // convention: benchmark runner/orchestrator can accept candidate overrides
        ...(opts.candidateOverrides as any),
      });

      const db2 = getDb();

      const agg = (benchmarkRunId: string) => db2.prepare(`
        SELECT
          AVG(bm.score) as avg_score,
          AVG(bm.groundedness) as avg_groundedness,
          AVG(bm.policy_compliance) as avg_policy,
          AVG(bm.cost_usd) as avg_cost,
          AVG(bm.latency_ms) as avg_latency,
          AVG(bm.gold_match) as avg_gold
        FROM benchmark_metrics bm
        JOIN benchmark_attempts ba ON ba.id = bm.attempt_id
        WHERE ba.benchmark_run_id = ?
      `).get(benchmarkRunId) as any;

      const b = agg(baseline.benchmarkRunId);
      const c = agg(candidate.benchmarkRunId);

      const delta = {
        score: (c.avg_score ?? 0) - (b.avg_score ?? 0),
        groundedness: (c.avg_groundedness ?? 0) - (b.avg_groundedness ?? 0),
        policy: (c.avg_policy ?? 0) - (b.avg_policy ?? 0),
        cost: (c.avg_cost ?? 0) - (b.avg_cost ?? 0),
        latency: (c.avg_latency ?? 0) - (b.avg_latency ?? 0),
        gold: (c.avg_gold ?? 0) - (b.avg_gold ?? 0),
      };

      const written = await this.artifacts.writeJson({
        runId: opts.proposalId,
        relPath: `artifacts/learning/simulations/${simulationId}.json`,
        data: {
          baselineBenchmarkRunId: baseline.benchmarkRunId,
          candidateBenchmarkRunId: candidate.benchmarkRunId,
          delta,
        },
        artifactKind: 'learning_simulation',
      });

      db2.prepare(`
        UPDATE simulation_runs
        SET baseline_benchmark_run_id = ?,
            candidate_benchmark_run_id = ?,
            status = 'completed',
            delta_json = ?,
            artifact_path = ?,
            finished_at = datetime('now')
        WHERE id = ?
      `).run(
        baseline.benchmarkRunId,
        candidate.benchmarkRunId,
        JSON.stringify(delta),
        written.artifactPath,
        simulationId
      );

      db2.close();

      return {
        simulationRunId: simulationId,
        baselineBenchmarkRunId: baseline.benchmarkRunId,
        candidateBenchmarkRunId: candidate.benchmarkRunId,
        delta,
        artifactPath: written.artifactPath,
      };
    } catch (error) {
      const db3 = getDb();
      db3.prepare(`
        UPDATE simulation_runs
        SET status = 'failed', finished_at = datetime('now'), delta_json = ?
        WHERE id = ?
      `).run(
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
        simulationId
      );
      db3.close();
      throw error;
    }
  }
}
16. Prompt drift auditor prompt