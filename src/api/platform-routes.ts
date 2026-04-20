import { getDb } from '@/db/migrate.js';
import { handleGitHubWebhook } from './webhooks/github.js';

export async function handlePlatformRoutes(url: URL, req: Request) {
  const method = req.method;

  // GitHub Webhook
  if (url.pathname === '/api/webhooks/github') {
    return handleGitHubWebhook(req);
  }

  // List Agents
  if (url.pathname === '/api/platform/agents' && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`SELECT * FROM remote_agents ORDER BY heartbeat_at DESC`).all();
    db.close();
    return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
  }

  // List Workspaces
  if (url.pathname === '/api/platform/workspaces' && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`SELECT * FROM workspaces ORDER BY created_at DESC`).all();
    db.close();
    return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
  }

  // Submit Run (Hosted)
  if (url.pathname === '/api/hosted-runs' && method === 'POST') {
     const body = await req.json() as any;
     const db = getDb();
     const id = `hr_${Math.random().toString(36).substr(2, 9)}`;
     db.prepare(`
       INSERT INTO hosted_runs (id, tenant_id, workspace_id, mode, status, request_json)
       VALUES (?, ?, ?, ?, 'queued', ?)
     `).run(id, body.tenantId || 'ten_default', body.workspaceId, body.mode, JSON.stringify(body.request));
     db.close();
     return new Response(JSON.stringify({ id }), { headers: { 'Content-Type': 'application/json' } });
  }

  return null;
}
