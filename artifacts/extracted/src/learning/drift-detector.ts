TypeScript

import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';
import { PROMPT_DRIFT_AUDITOR_SYSTEM_PROMPT, PromptDriftSchema } from '@/prompts/prompt-drift-auditor.js';

export class DriftDetector {
  private artifacts = new ImmutableArtifacts();

  async compare(opts: {
    targetKey: string;
    fromContent: string;
    toContent: string;
    fromVersionId?: string;
    toVersionId?: string;
  }) {
    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const report = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: PROMPT_DRIFT_AUDITOR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            targetKey: opts.targetKey,
            fromContent: opts.fromContent,
            toContent: opts.toContent,
          }, null, 2),
        },
      ],
      schema: PromptDriftSchema,
    });

    const id = `drf_${nanoid(10)}`;
    const written = await this.artifacts.writeJson({
      runId: opts.targetKey.replace(/[:/]/g, '_'),
      relPath: `artifacts/learning/drift/${id}.json`,
      data: report,
      artifactKind: 'prompt_drift_report',
    });

    const db = getDb();
    db.prepare(`
      INSERT INTO prompt_drift_reports
      (id, target_key, from_version_id, to_version_id, drift_score, regression_risk, report_json, artifact_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      opts.targetKey,
      opts.fromVersionId ?? null,
      opts.toVersionId ?? null,
      report.drift_score,
      report.regression_risk,
      JSON.stringify(report),
      written.artifactPath
    );
    db.close();

    return { reportId: id, artifactPath: written.artifactPath, report };
  }
}
17. Release gate