TypeScript

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';
import { PATTERN_EXTRACTOR_SYSTEM_PROMPT, PatternReportSchema } from '@/prompts/pattern-extractor.js';

export class PatternMiner {
  private artifacts = new ImmutableArtifacts();

  async mine(opts: {
    learningCycleId: string;
    sourceScope?: 'combined' | 'benchmarks' | 'runs' | 'portfolio';
  }) {
    const db = getDb();

    const benchmarkRows = db.prepare(`
      SELECT
        br.id as benchmark_run_id,
        ba.template_variant,
        ba.constitution_variant,
        bm.score,
        bm.groundedness,
        bm.policy_compliance,
        bm.gold_match,
        bm.cost_usd,
        bm.latency_ms,
        bm.acceptance_pass
      FROM benchmark_metrics bm
      JOIN benchmark_attempts ba ON ba.id = bm.attempt_id
      JOIN benchmark_runs br ON br.id = ba.benchmark_run_id
      ORDER BY bm.created_at DESC
      LIMIT 120
    `).all();

    const regressions = db.prepare(`
      SELECT * FROM regression_alarms
      ORDER BY created_at DESC
      LIMIT 50
    `).all();

    const policyReports = db.prepare(`
      SELECT cycle_number, role, score, approval_gaps, unsafe_action_count, violations_json
      FROM policy_reports
      ORDER BY created_at DESC
      LIMIT 80
    `).all();

    const routing = db.prepare(`
      SELECT * FROM routing_versions
      ORDER BY created_at DESC
      LIMIT 20
    `).all();

    db.close();

    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const report = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: PATTERN_EXTRACTOR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            sourceScope: opts.sourceScope ?? 'combined',
            benchmarkRows,
            regressions,
            policyReports,
            routing,
          }, null, 2),
        },
      ],
      schema: PatternReportSchema,
    });

    const reportId = `ptr_${nanoid(10)}`;
    const written = await this.artifacts.writeJson({
      runId: opts.learningCycleId,
      relPath: `artifacts/learning/patterns/${reportId}.json`,
      data: report,
      artifactKind: 'learning_pattern_report',
    });

    const db2 = getDb();
    db2.prepare(`
      INSERT INTO pattern_reports
      (id, learning_cycle_id, source_scope, subject_key, artifact_path, report_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      reportId,
      opts.learningCycleId,
      opts.sourceScope ?? 'combined',
      'global',
      written.artifactPath,
      JSON.stringify(report)
    );
    db2.close();

    return { reportId, artifactPath: written.artifactPath, report };
  }
}
6. Improvement proposer prompt