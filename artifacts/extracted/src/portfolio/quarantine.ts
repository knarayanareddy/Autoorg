TypeScript

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { ArtifactSigner } from '@/runtime/artifact-signing.js';
import { RedactionFilter } from '@/runtime/redaction.js';
import { QUARANTINE_REVIEWER_SYSTEM_PROMPT, QuarantineReviewSchema } from '@/prompts/quarantine-reviewer.js';

export class Quarantine {
  private signer = new ArtifactSigner();
  private redactor: RedactionFilter;

  constructor(private portfolioRunId: string) {
    this.redactor = new RedactionFilter(portfolioRunId);
  }

  async inspect(opts: {
    exchangeId: string;
    artifactPath: string;
  }) {
    const verify = await this.signer.verifyFile(opts.artifactPath);
    const rawText = await Bun.file(opts.artifactPath).text().catch(() => '');
    const redacted = this.redactor.redact(rawText, {
      channel: 'artifact',
      artifactPath: opts.artifactPath,
    });

    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const review = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: QUARANTINE_REVIEWER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            verify,
            artifactPath: opts.artifactPath,
            preview: redacted.text.slice(0, 12000),
          }, null, 2),
        },
      ],
      schema: QuarantineReviewSchema,
    });

    const quarantineDir = path.join(process.cwd(), 'artifacts', 'portfolio', 'quarantine');
    await mkdir(quarantineDir, { recursive: true });

    const quarantinedPath = path.join(quarantineDir, `${opts.exchangeId}.md`);
    await Bun.write(quarantinedPath, review.sanitized_summary || redacted.text.slice(0, 8000));

    const db = getDb();
    db.prepare(`
      INSERT INTO quarantined_artifacts
      (id, exchange_id, original_artifact_path, quarantined_artifact_path, status, findings_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `qa_${nanoid(10)}`,
      opts.exchangeId,
      opts.artifactPath,
      quarantinedPath,
      review.approved && !review.blocked ? 'released' : (review.should_redact_more ? 'sanitized' : 'blocked'),
      JSON.stringify({ verify, review, redacted: redacted.redacted, eventCount: redacted.eventCount })
    );

    db.prepare(`
      UPDATE portfolio_exchanges
      SET status = ?, quarantine_report_json = ?
      WHERE id = ?
    `).run(
      review.approved && !review.blocked ? 'approved' : 'blocked',
      JSON.stringify({ verify, review }),
      opts.exchangeId
    );
    db.close();

    return {
      approved: review.approved && !review.blocked,
      quarantinedPath,
      review,
    };
  }
}
12. Exchange bus