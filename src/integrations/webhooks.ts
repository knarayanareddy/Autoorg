import { createHmac, timingSafeEqual } from 'node:crypto';
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export function verifyGitHubSignature(body: string, signature: string | null): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const hmac = createHmac('sha256', secret);
  const digest = `sha256=${hmac.update(body).digest('hex')}`;

  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function storeGitHubEvent(opts: {
  eventType: string;
  deliveryId?: string | null;
  action?: string | null;
  repoFullName?: string | null;
  payload: unknown;
}) {
  const db = getDb();
  db.prepare(`
    INSERT INTO github_events
      (id, event_type, repo_full_name, delivery_id, action, payload_json, processed)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(
    `ghe_${nanoid(8)}`,
    opts.eventType,
    opts.repoFullName ?? null,
    opts.deliveryId ?? null,
    opts.action ?? null,
    JSON.stringify(opts.payload)
  );
  db.close();
}
