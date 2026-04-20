TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export class WorkspaceLock {
  acquire(lockKey: string, holderId: string, runId: string, ttlMs = 60_000) {
    const db = getDb();
    const now = new Date();
    const expires = new Date(now.getTime() + ttlMs).toISOString();

    const row = db.prepare(`
      SELECT * FROM workspace_locks
      WHERE lock_key = ?
    `).get(lockKey) as
      | { holder_id: string; lease_expires_at: string; status: string }
      | undefined;

    if (row && row.status === 'active' && new Date(row.lease_expires_at).getTime() > now.getTime()) {
      db.close();
      throw new Error(`Workspace lock already held by ${row.holder_id}`);
    }

    db.prepare(`
      INSERT INTO workspace_locks
      (lock_key, holder_id, run_id, status, lease_expires_at, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, '{}', datetime('now'), datetime('now'))
      ON CONFLICT(lock_key) DO UPDATE SET
        holder_id = excluded.holder_id,
        run_id = excluded.run_id,
        status = 'active',
        lease_expires_at = excluded.lease_expires_at,
        heartbeat_at = datetime('now'),
        updated_at = datetime('now')
    `).run(lockKey, holderId, runId, expires);

    db.close();
  }

  heartbeat(lockKey: string, holderId: string, ttlMs = 60_000) {
    const db = getDb();
    const expires = new Date(Date.now() + ttlMs).toISOString();
    db.prepare(`
      UPDATE workspace_locks
      SET heartbeat_at = datetime('now'),
          lease_expires_at = ?,
          updated_at = datetime('now')
      WHERE lock_key = ? AND holder_id = ? AND status = 'active'
    `).run(expires, lockKey, holderId);
    db.close();
  }

  release(lockKey: string, holderId: string) {
    const db = getDb();
    db.prepare(`
      UPDATE workspace_locks
      SET status = 'released', updated_at = datetime('now')
      WHERE lock_key = ? AND holder_id = ?
    `).run(lockKey, holderId);
    db.close();
  }

  sweepExpired() {
    const db = getDb();
    db.prepare(`
      UPDATE workspace_locks
      SET status = 'expired', updated_at = datetime('now')
      WHERE status = 'active' AND lease_expires_at < datetime('now')
    `).run();
    db.close();
  }

  async withLock<T>(
    lockKey: string,
    holderId: string,
    runId: string,
    fn: () => Promise<T>,
    ttlMs = 60_000,
  ): Promise<T> {
    this.acquire(lockKey, holderId, runId, ttlMs);
    try {
      return await fn();
    } finally {
      this.release(lockKey, holderId);
    }
  }
}
5. Recovery journal + resumable runs