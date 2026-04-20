TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

function currentMonthWindow() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  return { start, end };
}

function currentDayWindow() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
  return { start, end };
}

export class QuotaManager {
  ensureDefaultTenantQuotas(tenantId: string, planTier: 'free' | 'team' | 'enterprise' | 'internal' = 'team') {
    const defaults = planTier === 'free'
      ? {
          runs_per_day: 10,
          tokens_per_month: 300_000,
          usd_per_month: 15,
          storage_gb: 2,
          agents: 1,
          benchmarks_per_day: 1,
        }
      : planTier === 'enterprise'
        ? {
            runs_per_day: 1000,
            tokens_per_month: 100_000_000,
            usd_per_month: 10000,
            storage_gb: 500,
            agents: 100,
            benchmarks_per_day: 100,
          }
        : {
            runs_per_day: 200,
            tokens_per_month: 20_000_000,
            usd_per_month: 1000,
            storage_gb: 50,
            agents: 10,
            benchmarks_per_day: 20,
          };

    const db = getDb();
    for (const [quotaKey, limitValue] of Object.entries(defaults)) {
      db.prepare(`
        INSERT OR IGNORE INTO quota_policies
        (id, tenant_id, workspace_id, quota_key, limit_value, hard_limit)
        VALUES (?, ?, NULL, ?, ?, 1)
      `).run(`qp_${nanoid(8)}`, tenantId, quotaKey, limitValue);
    }
    db.close();
  }

  private windowFor(quotaKey: string) {
    return quotaKey.endsWith('_per_day') ? currentDayWindow() : currentMonthWindow();
  }

  canConsume(opts: {
    tenantId: string;
    workspaceId?: string;
    quotaKey: string;
    delta: number;
  }) {
    const db = getDb();
    const policy = db.prepare(`
      SELECT limit_value, hard_limit
      FROM quota_policies
      WHERE tenant_id = ?
        AND (workspace_id = ? OR workspace_id IS NULL)
        AND quota_key = ?
      ORDER BY CASE WHEN workspace_id IS NULL THEN 1 ELSE 0 END
      LIMIT 1
    `).get(opts.tenantId, opts.workspaceId ?? null, opts.quotaKey) as
      | { limit_value: number; hard_limit: number }
      | undefined;

    if (!policy) {
      db.close();
      return true;
    }

    const { start, end } = this.windowFor(opts.quotaKey);
    const usage = db.prepare(`
      SELECT used_value
      FROM quota_usage
      WHERE tenant_id = ?
        AND (? IS NULL OR workspace_id = ? OR workspace_id IS NULL)
        AND quota_key = ?
        AND window_start = ?
        AND window_end = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(
      opts.tenantId,
      opts.workspaceId ?? null,
      opts.workspaceId ?? null,
      opts.quotaKey,
      start,
      end
    ) as { used_value: number } | undefined;

    db.close();
    if (!policy.hard_limit) return true;
    return (usage?.used_value ?? 0) + opts.delta <= policy.limit_value;
  }

  consume(opts: {
    tenantId: string;
    workspaceId?: string;
    quotaKey: string;
    delta: number;
  }) {
    if (!this.canConsume(opts)) {
      throw new Error(`Quota exceeded: ${opts.quotaKey}`);
    }

    const { start, end } = this.windowFor(opts.quotaKey);
    const db = getDb();

    db.prepare(`
      INSERT INTO quota_usage
      (id, tenant_id, workspace_id, quota_key, window_start, window_end, used_value, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT DO NOTHING
    `).run(`qu_${nanoid(8)}`, opts.tenantId, opts.workspaceId ?? null, opts.quotaKey, start, end, 0);

    const row = db.prepare(`
      SELECT id FROM quota_usage
      WHERE tenant_id = ?
        AND workspace_id IS ?
        AND quota_key = ?
        AND window_start = ?
        AND window_end = ?
      LIMIT 1
    `).get(opts.tenantId, opts.workspaceId ?? null, opts.quotaKey, start, end) as { id: string };

    db.prepare(`
      UPDATE quota_usage
      SET used_value = used_value + ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(opts.delta, row.id);

    db.close();
  }
}
7. Billing service