TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

function computeNextRun(cronExpr: string): string {
  // Minimal scheduler: support tokens like:
  //   every_5m, every_30m, every_1h, daily
  const now = new Date();

  if (cronExpr === 'daily') {
    now.setDate(now.getDate() + 1);
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }

  const match = cronExpr.match(/^every_(\d+)(m|h)$/);
  if (match) {
    const amount = parseInt(match[1]!);
    const unit = match[2]!;
    if (unit === 'm') now.setMinutes(now.getMinutes() + amount);
    if (unit === 'h') now.setHours(now.getHours() + amount);
    return now.toISOString();
  }

  // fallback: 1 hour
  now.setHours(now.getHours() + 1);
  return now.toISOString();
}

export class Scheduler {
  createJob(opts: {
    runId?: string;
    jobType: 'org_run' | 'dream' | 'graph_rebuild' | 'health_check' | 'github_sync';
    cronExpr: string;
    payload?: Record<string, unknown>;
  }): string {
    const id = `job_${nanoid(8)}`;
    const db = getDb();
    db.prepare(`
      INSERT INTO scheduled_jobs
        (id, run_id, job_type, cron_expr, payload_json, enabled, next_run_at, status)
      VALUES (?, ?, ?, ?, ?, 1, ?, 'idle')
    `).run(
      id,
      opts.runId ?? null,
      opts.jobType,
      opts.cronExpr,
      JSON.stringify(opts.payload ?? {}),
      computeNextRun(opts.cronExpr)
    );
    db.close();
    return id;
  }

  dueJobs() {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM scheduled_jobs
      WHERE enabled = 1
        AND next_run_at IS NOT NULL
        AND datetime(next_run_at) <= datetime('now')
      ORDER BY next_run_at ASC
    `).all();
    db.close();
    return rows;
  }

  markRunning(id: string) {
    const db = getDb();
    db.prepare(`UPDATE scheduled_jobs SET status='running' WHERE id=?`).run(id);
    db.close();
  }

  markDone(id: string, cronExpr: string) {
    const db = getDb();
    db.prepare(`
      UPDATE scheduled_jobs
      SET status='idle', last_run_at=datetime('now'), next_run_at=?, last_error=NULL
      WHERE id=?
    `).run(computeNextRun(cronExpr), id);
    db.close();
  }

  markError(id: string, err: string, cronExpr: string) {
    const db = getDb();
    db.prepare(`
      UPDATE scheduled_jobs
      SET status='error', last_error=?, next_run_at=?
      WHERE id=?
    `).run(err.slice(0, 1000), computeNextRun(cronExpr), id);
    db.close();
  }
}
9. Daemon state + daemon runtime