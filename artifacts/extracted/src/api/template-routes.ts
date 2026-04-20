TypeScript

import { TemplateRegistry } from '@/platform/template-registry.js';
import { RoleRegistry } from '@/platform/role-registry.js';
import { TenantContextResolver } from '@/platform/tenant-context.js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handleTemplateRoutes(url: URL, req: Request) {
  const method = req.method;
  const resolver = new TenantContextResolver();
  const ctx = await resolver.fromRequest(req);

  const templates = new TemplateRegistry();
  const roles = new RoleRegistry();

  if (url.pathname === '/api/templates' && method === 'GET') {
    return json(templates.list({ tenantId: ctx?.tenantId }));
  }

  if (url.pathname === '/api/templates' && method === 'POST') {
    if (!ctx) return json({ error: 'unauthorized' }, 401);
    resolver.requirePermission(ctx, 'template.publish');

    const body = await req.json() as {
      templateKey: string;
      displayName: string;
      visibility: 'private' | 'tenant' | 'public';
      manifest: Record<string, unknown>;
    };

    const result = await templates.publish({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      ...body,
    });

    return json({ ok: true, result });
  }

  if (url.pathname === '/api/roles' && method === 'GET') {
    return json(roles.list(ctx?.tenantId));
  }

  return null;
}
24. Admin routes