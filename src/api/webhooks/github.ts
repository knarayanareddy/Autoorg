import { createHmac, timingSafeEqual } from 'node:crypto';
import { getDb } from '@/db/migrate.js';
import { nanoid } from 'nanoid';

export function verifySignature(payload: string, signature: string, secret: string): boolean {
  const hmac = createHmac('sha256', secret);
  const digest = Buffer.from('sha256=' + hmac.update(payload).digest('hex'), 'utf8');
  const sig = Buffer.from(signature, 'utf8');
  return timingSafeEqual(digest, sig);
}

export async function handleGitHubWebhook(req: Request) {
  const signature = req.headers.get('x-hub-signature-256');
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!signature || !secret) {
     return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.text();
  if (!verifySignature(body, signature, secret)) {
     return new Response('Invalid signature', { status: 403 });
  }

  const payload = JSON.parse(body);
  const event = req.headers.get('x-github-event');

  console.log(`[Webhook] Received GitHub event: ${event}`);

  if (event === 'pull_request' && payload.action === 'opened') {
     // Trigger a benchmark run for the PR
     return triggerProjectRun({
       mission: `Benchmark mission for PR #${payload.number}: ${payload.pull_request.title}. Repository: ${payload.repository.full_name}`,
       mode: 'benchmark',
       metadata: { pr_number: payload.number, repo: payload.repository.full_name }
     });
  }

  return new Response('Received', { status: 200 });
}

async function triggerProjectRun(opts: { mission: string; mode: string; metadata: any }) {
  const db = getDb();
  const id = `hr_${nanoid(10)}`;
  
  // Find a suitable workspace (simplified: find first active workspace for default tenant)
  const ws = db.prepare(`SELECT id, tenant_id FROM workspaces WHERE status = 'active' LIMIT 1`).get() as any;
  
  if (!ws) {
    db.close();
    return new Response('No active workspace found', { status: 500 });
  }

  db.prepare(`
    INSERT INTO hosted_runs (id, tenant_id, workspace_id, mode, status, request_json)
    VALUES (?, ?, ?, ?, 'queued', ?)
  `).run(id, ws.tenant_id, ws.id, opts.mode, JSON.stringify({ missionText: opts.mission, ...opts.metadata }));

  db.close();
  return new Response(JSON.stringify({ hostedRunId: id }), { status: 202 });
}
