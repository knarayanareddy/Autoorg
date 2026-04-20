TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export class LeaseManager {
  constructor(private runId: string) {}

  leaseTask(opts: {
    cycleNumber: number;
    taskId: string;
    workerRole: string;
    workerInstance: string;
    teamId?: string;
    payload?: Record<string, unknown>;
    ttlMs?: number;
  }) {
    const leaseId = `lease_${nanoid(10)}`;
    const expires = new Date(Date.now() + (opts.ttlMs ?? 45_000)).toISOString();

    const db = getDb();
    db.prepare(`
      INSERT INTO worker_leases
      (id, run_id, cycle_number, task_id, worker_role, worker_instance, team_id, status, lease_expires_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)
    `).run(
      leaseId,
      this.runId,
      opts.cycleNumber,
      opts.taskId,
      opts.workerRole,
      opts.workerInstance,
      opts.teamId ?? null,
      expires,
      JSON.stringify(opts.payload ?? {})
    );

    db.prepare(`
      UPDATE delegated_tasks
      SET status = 'running', updated_at = datetime('now')
      WHERE id = ?
    `).run(opts.taskId);

    db.close();
    return leaseId;
  }

  heartbeat(leaseId: string, ttlMs = 45_000) {
    const db = getDb();
    const expires = new Date(Date.now() + ttlMs).toISOString();
    db.prepare(`
      UPDATE worker_leases
      SET heartbeat_at = datetime('now'),
          lease_expires_at = ?,
          updated_at = datetime('now')
      WHERE id = ? AND status = 'running'
    `).run(expires, leaseId);
    db.close();
  }

  complete(leaseId: string, result: unknown) {
    const db = getDb();
    const lease = db.prepare(`SELECT task_id FROM worker_leases WHERE id = ?`).get(leaseId) as
      | { task_id: string }
      | undefined;

    db.prepare(`
      UPDATE worker_leases
      SET status = 'completed', result_json = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(result), leaseId);

    if (lease?.task_id) {
      db.prepare(`
        UPDATE delegated_tasks
        SET status = 'completed', result_summary = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        typeof result === 'string' ? result.slice(0, 500) : JSON.stringify(result).slice(0, 500),
        lease.task_id
      );
    }

    db.close();
  }

  reclaimExpired() {
    const db = getDb();
    const expired = db.prepare(`
      SELECT id, task_id FROM worker_leases
      WHERE status = 'running' AND lease_expires_at < datetime('now')
    `).all() as Array<{ id: string; task_id: string }>;

    for (const row of expired) {
      db.prepare(`
        UPDATE worker_leases
        SET status = 'reclaimed', updated_at = datetime('now')
        WHERE id = ?
      `).run(row.id);

      db.prepare(`
        UPDATE delegated_tasks
        SET status = 'pending', updated_at = datetime('now')
        WHERE id = ?
      `).run(row.task_id);
    }

    db.close();
    return expired.length;
  }
}
7. Incident log