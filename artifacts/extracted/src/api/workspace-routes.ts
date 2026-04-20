TypeScript

import { WorkspaceProvisioner } from '@/platform/workspace-provisioner.js';
import { HostedRunner } from '@/platform/hosted-runner.js';
import { TenantContextResolver } from '@/platform/tenant-context.js';
import { getDb } from '@/db/migrate.js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handleWorkspaceRoutes(url: URL, req: Request) {
  const method = req.method;
  const resolver = new TenantContextResolver();
  const ctx = await resolver.fromRequest(req);

  if (url.pathname === '/api/workspaces' && method === 'POST') {
    if (!ctx) return json({ error: 'unauthorized' }, 401);
    resolver.requirePermission(ctx, 'workspace.create');

    const body = await req.json() as {
      slug: string;
      displayName: string;
      repoUrl?: string;
      defaultBranch?: string;
      isolationMode?: 'directory' | 'git_worktree' | 'container';
    };

    const provisioner = new WorkspaceProvisioner();
    const result = await provisioner.create({
      tenantId: ctx.tenantId,
      slug: body.slug,
      displayName: body.displayName,
      repoUrl: body.repoUrl,
      defaultBranch: body.defaultBranch,
      isolationMode: body.isolationMode,
    });

    return json({ ok: true, result });
  }

  if (url.pathname === '/api/workspaces' && method === 'GET') {
    if (!ctx) return json({ error: 'unauthorized' }, 401);
    resolver.requirePermission(ctx, 'workspace.read');

    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM workspaces
      WHERE tenant_id = ?
      ORDER BY created_at DESC
    `).all(ctx.tenantId);
    db.close();

    return json(rows);
  }

  if (url.pathname === '/api/hosted-runs' && method === 'POST') {
    if (!ctx) return json({ error: 'unauthorized' }, 401);

    const body = await req.json() as {
      workspaceId: string;
      mode: 'single_org' | 'portfolio' | 'benchmark' | 'daemon';
      request: Record<string, unknown>;
    };

    resolver.requirePermission(ctx, 'run.create', body.workspaceId);

    const runner = new HostedRunner();
    const result = runner.submit({
      tenantId: ctx.tenantId,
      workspaceId: body.workspaceId,
      submittedByUserId: ctx.userId,
      apiKeyId: ctx.apiKeyId,
      mode: body.mode,
      request: body.request,
    });

    return json({ ok: true, result });
  }

  const match = url.pathname.match(/^\/api\/hosted-runs\/([^/]+)$/);
  if (match && method === 'GET') {
    if (!ctx) return json({ error: 'unauthorized' }, 401);

    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM hosted_runs
      WHERE id = ? AND tenant_id = ?
      LIMIT 1
    `).get(match[1], ctx.tenantId);
    db.close();

    if (!row) return json({ error: 'not_found' }, 404);

    resolver.requirePermission(ctx, 'run.read', (row as any).workspace_id);
    return json(row);
  }

  return null;
}
21. Auth routes