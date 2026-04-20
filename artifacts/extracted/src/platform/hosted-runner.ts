TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { QuotaManager } from '@/platform/quota-manager.js';
import { BillingService } from '@/platform/billing.js';

export class HostedRunner {
  private quotas = new QuotaManager();
  private billing = new BillingService();

  submit(opts: {
    tenantId: string;
    workspaceId: string;
    submittedByUserId?: string;
    apiKeyId?: string;
    mode: 'single_org' | 'portfolio' | 'benchmark' | 'daemon';
    request: Record<string, unknown>;
  }) {
    this.quotas.consume({
      tenantId: opts.tenantId,
      workspaceId: opts.workspaceId,
      quotaKey: 'runs_per_day',
      delta: 1,
    });

    const db = getDb();
    const id = `hr_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO hosted_runs
      (id, tenant_id, workspace_id, submitted_by_user_id, api_key_id, mode, status, request_json)
      VALUES (?, ?, ?, ?, ?, ?, 'queued', ?)
    `).run(
      id,
      opts.tenantId,
      opts.workspaceId,
      opts.submittedByUserId ?? null,
      opts.apiKeyId ?? null,
      opts.mode,
      JSON.stringify(opts.request)
    );

    db.close();

    this.billing.record({
      tenantId: opts.tenantId,
      workspaceId: opts.workspaceId,
      hostedRunId: id,
      eventType: 'run',
      quantity: 1,
      unitCostUsd: 0.01,
      metadata: { mode: opts.mode },
    });

    return { hostedRunId: id };
  }

  claimQueuedRun(agentId: string) {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM hosted_runs
      WHERE status = 'queued'
      ORDER BY created_at ASC
      LIMIT 1
    `).get() as any;

    if (!row) {
      db.close();
      return null;
    }

    db.prepare(`
      UPDATE hosted_runs
      SET status = 'running',
          assigned_agent_id = ?,
          started_at = datetime('now')
      WHERE id = ?
    `).run(agentId, row.id);

    db.close();
    return row;
  }

  complete(opts: {
    hostedRunId: string;
    autoorgRunRef?: string;
    portfolioRunRef?: string;
    outputArtifactPath?: string;
    reportArtifactPath?: string;
  }) {
    const db = getDb();
    db.prepare(`
      UPDATE hosted_runs
      SET status = 'completed',
          autoorg_run_ref = ?,
          portfolio_run_ref = ?,
          output_artifact_path = ?,
          report_artifact_path = ?,
          finished_at = datetime('now')
      WHERE id = ?
    `).run(
      opts.autoorgRunRef ?? null,
      opts.portfolioRunRef ?? null,
      opts.outputArtifactPath ?? null,
      opts.reportArtifactPath ?? null,
      opts.hostedRunId
    );
    db.close();
  }

  fail(hostedRunId: string, error: string) {
    const db = getDb();
    db.prepare(`
      UPDATE hosted_runs
      SET status = 'failed',
          report_artifact_path = NULL,
          finished_at = datetime('now')
      WHERE id = ?
    `).run(hostedRunId);
    db.close();
    return { error };
  }
}
9. Remote agent service