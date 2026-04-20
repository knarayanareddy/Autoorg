TypeScript

import { ObservabilityService } from '@/platform/observability.js';
import { BackupManager } from '@/platform/backup-manager.js';
import { TenantContextResolver } from '@/platform/tenant-context.js';
import { getDb } from '@/db/migrate.js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handleAdminRoutes(url: URL, req: Request) {
  const resolver = new TenantContextResolver();
  const ctx = await resolver.fromRequest(req);
  const method = req.method;

  if (url.pathname === '/api/admin/observability' && method === 'GET') {
    if (!ctx) return json({ error: 'unauthorized' }, 401);
    resolver.requirePermission(ctx, 'billing.read'); // simplest admin-ish gate for now
    const obs = new ObservabilityService();
    return json(obs.snapshotTenant(ctx.tenantId));
  }

  if (url.pathname === '/api/admin/compliance' && method === 'GET') {
    if (!ctx) return json({ error: 'unauthorized' }, 401);
    resolver.requirePermission(ctx, 'billing.read');

    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM compliance_logs
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT 300
    `).all(ctx.tenantId);
    db.close();

    return json(rows);
  }

  if (url.pathname === '/api/admin/backups' && method === 'POST') {
    if (!ctx) return json({ error: 'unauthorized' }, 401);
    resolver.requirePermission(ctx, 'workspace.read');

    const body = await req.json() as {
      workspaceId: string;
      sourcePath: string;
    };

    const backup = new BackupManager();
    const result = await backup.backupWorkspace({
      tenantId: ctx.tenantId,
      workspaceId: body.workspaceId,
      sourcePath: body.sourcePath,
    });

    return json({ ok: true, result });
  }

  return null;
}
25. SDK routes