TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export class BillingService {
  record(opts: {
    tenantId: string;
    workspaceId?: string;
    hostedRunId?: string;
    eventType: 'run' | 'llm_tokens' | 'tool_calls' | 'storage' | 'backup' | 'agent_minutes' | 'benchmark';
    quantity: number;
    unitCostUsd: number;
    metadata?: Record<string, unknown>;
  }) {
    const total = Number((opts.quantity * opts.unitCostUsd).toFixed(6));
    const db = getDb();

    db.prepare(`
      INSERT INTO billing_events
      (id, tenant_id, workspace_id, hosted_run_id, event_type, quantity, unit_cost_usd, total_cost_usd, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `bill_${nanoid(10)}`,
      opts.tenantId,
      opts.workspaceId ?? null,
      opts.hostedRunId ?? null,
      opts.eventType,
      opts.quantity,
      opts.unitCostUsd,
      total,
      JSON.stringify(opts.metadata ?? {})
    );

    db.close();
    return { totalCostUsd: total };
  }

  summary(tenantId: string) {
    const db = getDb();
    const row = db.prepare(`
      SELECT
        COUNT(*) as events,
        COALESCE(SUM(total_cost_usd), 0) as total_usd
      FROM billing_events
      WHERE tenant_id = ?
    `).get(tenantId) as { events: number; total_usd: number };
    db.close();
    return row;
  }
}
8. Hosted runner