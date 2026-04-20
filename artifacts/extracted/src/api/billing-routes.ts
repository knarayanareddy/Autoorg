TypeScript

import { BillingService } from '@/platform/billing.js';
import { TenantContextResolver } from '@/platform/tenant-context.js';
import { getDb } from '@/db/migrate.js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handleBillingRoutes(url: URL, req: Request) {
  const resolver = new TenantContextResolver();
  const ctx = await resolver.fromRequest(req);
  const method = req.method;

  if (!ctx) return null;

  if (url.pathname === '/api/billing/summary' && method === 'GET') {
    resolver.requirePermission(ctx, 'billing.read');
    const billing = new BillingService();
    return json(billing.summary(ctx.tenantId));
  }

  if (url.pathname === '/api/billing/events' && method === 'GET') {
    resolver.requirePermission(ctx, 'billing.read');
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM billing_events
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT 200
    `).all(ctx.tenantId);
    db.close();
    return json(rows);
  }

  return null;
}
23. Template routes