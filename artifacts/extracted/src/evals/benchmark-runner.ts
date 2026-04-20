TypeScript

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import simpleGit from 'simple-git';
import { getDb } from '@/db/migrate.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';
import { BenchmarkSuiteLoader } from '@/evals/suite-loader.js';
import { GoldEvaluator } from '@/evals/gold-evaluator.js';
import { LeaderboardService } from '@/evals/leaderboard.js';
import { RegressionDetector } from '@/evals/regression-detector.js';

export class BenchmarkRunner {
  private git = simpleGit();
  private artifacts = new ImmutableArtifacts();
  private loader = new BenchmarkSuiteLoader();
  private gold = new GoldEvaluator();
  private boards = new LeaderboardService();
  private regressions = new RegressionDetector();

  async runSuite(opts: {
    suiteName: string;
    runLabel?: string;
    mode?: 'manual' | 'ci' | 'ab_test' | 'bakeoff' | 'replay';
    constitutionVariant?: string;
    templateVariant?: string;
    modelMap?: Record<string, string>;
    seed?: number;
  }) {
    const cases = await this.loader.persistSuite(opts.suiteName);
    const gitHead = (await this.git.revparse(['HEAD'])).trim().catch(() => '');
    const db = getDb();

    const suiteRow = db.prepare(`
      SELECT id FROM benchmark_suites WHERE suite_name = ?
    `).get(opts.suiteName) as { id: string };

    const benchmarkRunId = `br_${nanoid(10)}`;
    db.prepare(`
      INSERT INTO benchmark_runs
      (id, suite_id, run_label, mode, git_head, orchestrator_version, constitution_variant, template_variant, model_map_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running')
    `).run(
      benchmarkRunId,
      suiteRow.id,
      opts.runLabel ?? `${opts.suiteName}-${Date.now()}`,
      opts.mode ?? 'manual',
      gitHead,
      process.env.AUTOORG_VERSION ?? 'dev',
      opts.constitutionVariant ?? 'default',
      opts.templateVariant ?? 'default',
      JSON.stringify(opts.modelMap ?? {})
    );
    db.close();

    await mkdir(path.join(process.cwd(), 'benchmarks', 'outputs', 'runs'), { recursive: true });

    for (const c of cases) {
      await this.runCase({
        benchmarkRunId,
        caseDef: c,
        modelMap: opts.modelMap ?? {},
        templateVariant: opts.templateVariant ?? c.config.template_variant ?? 'baseline',
        constitutionVariant: opts.constitutionVariant ?? 'default',
        seed: opts.seed ?? c.config.seed ?? 42,
      });
    }

    await this.boards.recomputeForSuite(suiteRow.id);
    await this.regressions.scanRun(benchmarkRunId);

    const db2 = getDb();
    db2.prepare(`
      UPDATE benchmark_runs
      SET status = 'completed', finished_at = datetime('now')
      WHERE id = ?
    `).run(benchmarkRunId);
    db2.close();

    return { benchmarkRunId };
  }

  async runCase(opts: {
    benchmarkRunId: string;
    caseDef: any;
    modelMap: Record<string, string>;
    templateVariant: string;
    constitutionVariant: string;
    seed: number;
  }) {
    const db = getDb();
    const attemptId = `ba_${nanoid(10)}`;

    const outputPath = path.join(process.cwd(), 'benchmarks', 'outputs', 'runs', `${attemptId}.output.md`);
    const reportPath = path.join(process.cwd(), 'benchmarks', 'outputs', 'runs', `${attemptId}.report.json`);

    db.prepare(`
      INSERT INTO benchmark_attempts
      (id, benchmark_run_id, case_id, seed, model_map_json, template_variant, constitution_variant, output_path, report_path, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running')
    `).run(
      attemptId,
      opts.benchmarkRunId,
      opts.caseDef.id,
      opts.seed,
      JSON.stringify(opts.modelMap),
      opts.templateVariant,
      opts.constitutionVariant,
      outputPath,
      reportPath,
    );
    db.close();

    const started = Date.now();

    try {
      // You can wire this into your actual orchestrator benchmark mode.
      // Baseline placeholder here assumes `runBenchmarkCase` exists.
      const result = await runBenchmarkCase({
        orgText: opts.caseDef.org,
        constitutionText: opts.caseDef.constitution,
        caseConfig: opts.caseDef.config,
        templateVariant: opts.templateVariant,
        constitutionVariant: opts.constitutionVariant,
        modelMap: opts.modelMap,
        seed: opts.seed,
      });

      const latencyMs = Date.now() - started;

      await this.artifacts.writeText({
        runId: opts.benchmarkRunId,
        relPath: path.relative(process.cwd(), outputPath),
        text: result.outputText,
        artifactKind: 'benchmark_output',
      });

      const goldEval = await this.gold.evaluate({
        caseConfig: opts.caseDef.config,
        goldText: opts.caseDef.gold,
        outputText: result.outputText,
        metrics: {
          score: result.score.composite,
          groundedness: result.score.groundedness,
          novelty: result.score.novelty,
          consistency: result.score.consistency,
          missionAlignment: result.score.missionAlignment,
          policyCompliance: result.score.policyCompliance ?? 1,
          costUsd: result.costUsd ?? 0,
          latencyMs,
          unsupportedClaims: result.verificationReport?.unsupported_claims ?? 0,
        },
        acceptance: opts.caseDef.acceptance,
      });

      await this.artifacts.writeJson({
        runId: opts.benchmarkRunId,
        relPath: path.relative(process.cwd(), reportPath),
        data: {
          result,
          goldEval,
          latencyMs,
        },
        artifactKind: 'benchmark_report',
      });

      const db2 = getDb();
      db2.prepare(`
        UPDATE benchmark_attempts
        SET autoorg_run_id = ?, status = 'completed', finished_at = datetime('now')
        WHERE id = ?
      `).run(result.runId ?? null, attemptId);

      db2.prepare(`
        INSERT INTO benchmark_metrics
        (id, attempt_id, score, groundedness, novelty, consistency, mission_alignment, policy_compliance,
         gold_match, acceptance_pass, latency_ms, cost_usd, tool_calls, unsupported_claims, broken_provenance_links, security_findings)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `bm_${nanoid(10)}`,
        attemptId,
        result.score.composite,
        result.score.groundedness,
        result.score.novelty,
        result.score.consistency,
        result.score.missionAlignment,
        result.score.policyCompliance ?? 1,
        goldEval.gold_match,
        goldEval.acceptance_pass ? 1 : 0,
        latencyMs,
        result.costUsd ?? 0,
        result.toolCalls ?? 0,
        result.verificationReport?.unsupported_claims ?? 0,
        result.provenanceReport?.broken_links ?? 0,
        result.securityFindingCount ?? 0,
      );

      db2.close();
    } catch (error) {
      const db3 = getDb();
      db3.prepare(`
        UPDATE benchmark_attempts
        SET status = 'failed', finished_at = datetime('now')
        WHERE id = ?
      `).run(attemptId);
      db3.close();
      throw error;
    }
  }
}

// Adapter function to your orchestrator benchmark mode.
async function runBenchmarkCase(input: any) {
  if (typeof globalThis.__AUTOORG_BENCHMARK_RUNNER__ === 'function') {
    return await globalThis.__AUTOORG_BENCHMARK_RUNNER__(input);
  }

  throw new Error('No benchmark runner is wired. Expose orchestrator benchmark entrypoint first.');
}
8. Leaderboards