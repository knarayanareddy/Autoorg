TypeScript

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { ArtifactSigner } from '@/runtime/artifact-signing.js';
import { Quarantine } from '@/portfolio/quarantine.js';

export class ExchangeBus {
  private signer = new ArtifactSigner();
  private quarantine: Quarantine;

  constructor(private portfolioRunId: string) {
    this.quarantine = new Quarantine(portfolioRunId);
  }

  async send(opts: {
    fromVariantId: string;
    toVariantId: string;
    artifactPath: string;
    exchangeType: 'evidence' | 'draft' | 'plan' | 'memory_note';
  }) {
    const db = getDb();

    const exchangeId = `pex_${nanoid(10)}`;
    const row = db.prepare(`
      SELECT sha256
      FROM artifact_manifests
      WHERE artifact_path = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(opts.artifactPath) as { sha256?: string } | undefined;

    db.prepare(`
      INSERT INTO portfolio_exchanges
      (id, portfolio_run_id, from_variant_id, to_variant_id, artifact_path, artifact_sha256, exchange_type, status, quarantine_report_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', '{}')
    `).run(
      exchangeId,
      this.portfolioRunId,
      opts.fromVariantId,
      opts.toVariantId,
      opts.artifactPath,
      row?.sha256 ?? null,
      opts.exchangeType
    );
    db.close();

    const reviewed = await this.quarantine.inspect({
      exchangeId,
      artifactPath: opts.artifactPath,
    });

    if (!reviewed.approved) {
      return { exchangeId, delivered: false };
    }

    const db2 = getDb();
    const target = db2.prepare(`
      SELECT worktree_path
      FROM portfolio_variants
      WHERE id = ?
    `).get(opts.toVariantId) as { worktree_path: string };

    const inboxDir = path.join(target.worktree_path, 'memory', 'external');
    await mkdir(inboxDir, { recursive: true });

    const deliveredPath = path.join(inboxDir, `${exchangeId}.md`);
    await Bun.write(deliveredPath, await Bun.file(reviewed.quarantinedPath).text());

    db2.prepare(`
      UPDATE portfolio_exchanges
      SET status = 'delivered', delivered_path = ?, delivered_at = datetime('now')
      WHERE id = ?
    `).run(deliveredPath, exchangeId);

    db2.close();

    return { exchangeId, delivered: true, deliveredPath };
  }
}
13. Best-of-N synthesis prompt