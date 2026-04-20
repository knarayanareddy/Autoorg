TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export class ObservabilityService {
  snapshotPlatform() {
    const db = getDb();

    const tenants = db.prepare(`SELECT COUNT(*) as n FROM tenants WHERE status = 'active'`).get() as { n: number };
    const workspaces = db.prepare(`SELECT COUNT(*) as n FROM workspaces WHERE status = 'active'`).get() as { n: number };
    const runs = db.prepare(`SELECT COUNT(*) as n FROM hosted_runs WHERE status IN ('queued','running')`).get() as { n: number };
    const agents = db.prepare(`SELECT COUNT(*) as n FROM remote_agents WHERE status IN ('idle','busy')`).get() as { n: number };
    const billing = db.prepare(`SELECT COALESCE(SUM(total_cost_usd), 0) as usd FROM billing_events`).get() as { usd: number };

    const metrics = {
      activeTenants: tenants.n,
      activeWorkspaces: workspaces.n,
      inflightHostedRuns: runs.n,
      onlineAgents: agents.n,
      totalBilledUsd: billing.usd,
    };

    db.prepare(`
      INSERT INTO observability_snapshots
      (id, tenant_id, workspace_id, snapshot_type, metrics_json)
      VALUES (?, NULL, NULL, 'platform', ?)
    `).run(`obs_${nanoid(10)}`, JSON.stringify(metrics));

    db.close();
    return metrics;
  }

  snapshotTenant(tenantId: string) {
    const db = getDb();

    const workspaces = db.prepare(`SELECT COUNT(*) as n FROM workspaces WHERE tenant_id = ? AND status = 'active'`).get(tenantId) as { n: number };
    const runs = db.prepare(`SELECT COUNT(*) as n FROM hosted_runs WHERE tenant_id = ? AND status IN ('queued','running')`).get(tenantId) as { n: number };
    const billed = db.prepare(`SELECT COALESCE(SUM(total_cost_usd), 0) as usd FROM billing_events WHERE tenant_id = ?`).get(tenantId) as { usd: number };

    const metrics = {
      activeWorkspaces: workspaces.n,
      inflightRuns: runs.n,
      billedUsd: billed.usd,
    };

    db.prepare(`
      INSERT INTO observability_snapshots
      (id, tenant_id, workspace_id, snapshot_type, metrics_json)
      VALUES (?, ?, NULL, 'tenant', ?)
    `).run(`obs_${nanoid(10)}`, tenantId, JSON.stringify(metrics));

    db.close();
    return metrics;
  }
}
17. Deployment modes