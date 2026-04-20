TypeScript

#!/usr/bin/env bun
import { BenchmarkRunner } from '@/evals/benchmark-runner.js';
import { getDb } from '@/db/migrate.js';

async function main() {
  const suiteName = process.env.BENCHMARK_SUITE ?? 'core';
  const constitutionVariant = process.env.BENCHMARK_CONSTITUTION ?? 'default';
  const templateVariant = process.env.BENCHMARK_TEMPLATE ?? 'baseline';

  const runner = new BenchmarkRunner();
  const { benchmarkRunId } = await runner.runSuite({
    suiteName,
    mode: 'ci',
    constitutionVariant,
    templateVariant,
    runLabel: `ci-${suiteName}-${Date.now()}`,
  });

  const db = getDb();
  const failures = db.prepare(`
    SELECT COUNT(*) as n
    FROM benchmark_metrics bm
    JOIN benchmark_attempts ba ON ba.id = bm.attempt_id
    WHERE ba.benchmark_run_id = ? AND bm.acceptance_pass = 0
  `).get(benchmarkRunId) as { n: number };

  const regressions = db.prepare(`
    SELECT COUNT(*) as n
    FROM regression_alarms
    WHERE benchmark_run_id = ? AND severity IN ('error','critical')
  `).get(benchmarkRunId) as { n: number };
  db.close();

  console.log(`Benchmark run: ${benchmarkRunId}`);
  console.log(`Acceptance failures: ${failures.n}`);
  console.log(`Serious regressions: ${regressions.n}`);

  if (failures.n > 0 || regressions.n > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
17. Orchestrator benchmark mode
Patch src/runtime/orchestrator.ts
Add a benchmark entrypoint wrapper, not a separate orchestration stack.

Add:

TypeScript

export async function runBenchmarkMode(input: {
  orgText: string;
  constitutionText: string;
  caseConfig: Record<string, unknown>;
  templateVariant?: string;
  constitutionVariant?: string;
  modelMap?: Record<string, string>;
  seed?: number;
}) {
  const run = await runAutoOrg({
    orgText: input.orgText,
    constitutionText: input.constitutionText,
    mode: 'benchmark',
    maxCycles: Number(input.caseConfig.max_cycles ?? 4),
    seed: input.seed ?? 42,
    templateVariant: input.templateVariant,
    constitutionVariant: input.constitutionVariant,
    modelMap: input.modelMap,
  });

  return {
    runId: run.runId,
    outputText: run.finalOutputText,
    score: run.finalScore,
    costUsd: run.totalCostUsd ?? 0,
    toolCalls: run.totalToolCalls ?? 0,
    verificationReport: run.verificationReport,
    provenanceReport: run.provenanceReport,
    securityFindingCount: run.securityFindingCount ?? 0,
  };
}
Then expose it for the benchmark runner:

TypeScript

(globalThis as any).__AUTOORG_BENCHMARK_RUNNER__ = runBenchmarkMode;
This keeps the benchmark lab using the real orchestrator, not a toy path.

18. Results logger benchmark awareness
Patch src/runtime/results-logger.ts
If benchmark mode is enabled, also emit a benchmark-friendly JSON sidecar per cycle:

TypeScript

if (mode === 'benchmark') {
  await Bun.write(
    `benchmarks/outputs/runs/${runId}.cycles.json`,
    JSON.stringify(cycleRows, null, 2)
  );
}
This helps replay and judge calibration later.

19. API routes