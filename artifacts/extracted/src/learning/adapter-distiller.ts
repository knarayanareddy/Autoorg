TypeScript

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';

export class AdapterDistiller {
  private artifacts = new ImmutableArtifacts();

  async exportDataset(opts: {
    learningCycleId?: string;
    jobKind: 'planner' | 'judge' | 'router' | 'tool_planner' | 'critic';
    minScore?: number;
    minPolicyCompliance?: number;
  }) {
    const db = getDb();
    const jobId = `dst_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO distillation_jobs
      (id, learning_cycle_id, job_kind, status, source_filter_json)
      VALUES (?, ?, ?, 'running', ?)
    `).run(
      jobId,
      opts.learningCycleId ?? null,
      opts.jobKind,
      JSON.stringify({
        minScore: opts.minScore ?? 0.8,
        minPolicyCompliance: opts.minPolicyCompliance ?? 0.95,
      })
    );

    const rows = db.prepare(`
      SELECT
        te.id as tool_execution_id,
        te.tool_name,
        te.input_json,
        te.output_summary,
        bm.score,
        bm.policy_compliance
      FROM tool_executions te
      LEFT JOIN benchmark_attempts ba ON ba.autoorg_run_id = te.run_id
      LEFT JOIN benchmark_metrics bm ON bm.attempt_id = ba.id
      WHERE (bm.score IS NULL OR bm.score >= ?)
        AND (bm.policy_compliance IS NULL OR bm.policy_compliance >= ?)
      ORDER BY te.created_at DESC
      LIMIT 500
    `).all(opts.minScore ?? 0.8, opts.minPolicyCompliance ?? 0.95);

    const jsonl = rows.map((row: any) => JSON.stringify({
      input: row.input_json ? JSON.parse(row.input_json) : {},
      output_summary: row.output_summary,
      tool_name: row.tool_name,
      metadata: {
        score: row.score,
        policyCompliance: row.policy_compliance,
      },
    })).join('\n');

    const written = await this.artifacts.writeText({
      runId: opts.learningCycleId ?? jobId,
      relPath: `artifacts/learning/distillation/${jobId}.jsonl`,
      text: jsonl,
      artifactKind: 'distillation_dataset',
      mimeType: 'application/jsonl',
    });

    db.prepare(`
      UPDATE distillation_jobs
      SET status = 'completed', dataset_artifact_path = ?, metrics_json = ?, finished_at = datetime('now')
      WHERE id = ?
    `).run(
      written.artifactPath,
      JSON.stringify({ rows: rows.length }),
      jobId
    );

    db.close();
    return { jobId, artifactPath: written.artifactPath, rows: rows.length };
  }
}
14. Rollout simulator prompt