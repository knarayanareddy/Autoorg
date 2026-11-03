import { createHmac, timingSafeEqual } from 'node:crypto';
import { getDb } from '@/db/migrate.js';
import { nanoid } from 'nanoid';

/**
 * Verify a GitHub webhook signature.
 *
 * `timingSafeEqual` THROWS when the buffers differ in length, so a malformed or
 * truncated `x-hub-signature-256` header used to turn an unauthenticated
 * endpoint into a 500. Compare lengths first and bail out cheaply.
 *
 * This mirrors `verifyGitHubSignature` in `src/integrations/webhooks.ts`; the
 * two implementations disagreed (only one had a guard), so both are now
 * length-checked.
 */
export function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;

  const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

  // Length check before the constant-time compare, otherwise it throws.
  if (expected.length !== signature.length) return false;

  try {
    return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'));
  } catch {
    return false;
  }
}

export async function handleGitHubWebhook(req: Request) {
  const signature = req.headers.get('x-hub-signature-256');
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    // Fail closed and say why: a missing secret is a misconfiguration, not a
    // reason to accept unsigned payloads.
    return new Response('Webhook secret not configured', { status: 503 });
  }
  if (!signature) {
    return new Response('Missing signature', { status: 401 });
  }

  const body = await req.text();
  if (!verifySignature(body, signature, secret)) {
    return new Response('Invalid signature', { status: 403 });
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response('Malformed JSON', { status: 400 });
  }

  const event = req.headers.get('x-github-event');

  console.log(`[Webhook] Received GitHub event: ${event}`);

  if (event === 'pull_request' && payload.action === 'opened') {
     // Trigger a benchmark run for the PR
     return triggerProjectRun({
       mission: `Benchmark mission for PR #${payload.number}: ${payload.pull_request?.title ?? ''}. Repository: ${payload.repository?.full_name ?? 'unknown'}`,
       mode: 'benchmark',
       metadata: { pr_number: payload.number, repo: payload.repository?.full_name }
     });
  }

  return new Response('Received', { status: 200 });
}

async function triggerProjectRun(opts: { mission: string; mode: string; metadata: any }) {
  const db = getDb();
  try {
    const id = `hr_${nanoid(10)}`;

    // Find a suitable workspace (simplified: find first active workspace for default tenant)
    const ws = db.prepare(`SELECT id, tenant_id FROM workspaces WHERE status = 'active' LIMIT 1`).get() as any;

    if (!ws) {
      return new Response('No active workspace found', { status: 500 });
    }

    db.prepare(`
      INSERT INTO hosted_runs (id, tenant_id, workspace_id, mode, status, request_json)
      VALUES (?, ?, ?, ?, 'queued', ?)
    `).run(id, ws.tenant_id, ws.id, opts.mode, JSON.stringify({ missionText: opts.mission, ...opts.metadata }));

    return new Response(JSON.stringify({ hostedRunId: id }), { status: 202 });
  } finally {
    db.close();
  }
}
