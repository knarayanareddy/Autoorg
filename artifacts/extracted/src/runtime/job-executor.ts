TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { DreamEngine } from '@/runtime/dream.js';
import { graphManager } from '@/runtime/graph-manager.js';
import { IncidentLog } from '@/runtime/incident-log.js';

export class JobExecutor {
  private incidents = new IncidentLog();

  claimJob(jobId: string, claimedBy: string, ttlMs = 60_000) {
    const db = getDb();
    const executionId = `jx_${nanoid(10)}`;
    const expires = new Date(Date.now() + ttlMs).toISOString();

    db.prepare(`
      INSERT INTO job_executions
      (id, job_id, status, claimed_by, lease_expires_at, started_at)
      VALUES (?, ?, 'running', ?, ?, datetime('now'))
    `).run(executionId, jobId, claimedBy, expires);

    db.prepare(`
      UPDATE scheduled_jobs
      SET status = 'running'
      WHERE id = ?
    `).run(jobId);

    db.close();
    return executionId;
  }

  async runJob(job: {
    id: string;
    job_type: 'org_run' | 'dream' | 'graph_rebuild' | 'health_check' | 'github_sync';
    run_id?: string | null;
    payload_json: string;
  }, claimedBy = 'daemon_default') {
    const executionId = this.claimJob(job.id, claimedBy);
    const db = getDb();

    try {
      const payload = JSON.parse(job.payload_json || '{}');

      if (job.job_type === 'dream' && job.run_id) {
        const dream = new DreamEngine(job.run_id);
        await dream.run();
      }

      if (job.job_type === 'graph_rebuild' && job.run_id) {
        graphManager.init(job.run_id);
        await graphManager.ensureBuilt(payload.config ?? {});
      }

      if (job.job_type === 'health_check') {
        // no-op diagnostic job for now
      }

      db.prepare(`
        UPDATE job_executions
        SET status = 'completed', finished_at = datetime('now'), output_json = ?
        WHERE id = ?
      `).run(JSON.stringify({ ok: true, jobType: job.job_type }), executionId);

      db.prepare(`
        UPDATE scheduled_jobs
        SET status = 'idle', last_run_at = datetime('now'), last_error = NULL
        WHERE id = ?
      `).run(job.id);
    } catch (error) {
      db.prepare(`
        UPDATE job_executions
        SET status = 'failed', finished_at = datetime('now'), error_text = ?
        WHERE id = ?
      `).run(error instanceof Error ? error.message : String(error), executionId);

      db.prepare(`
        UPDATE scheduled_jobs
        SET status = 'error', last_error = ?
        WHERE id = ?
      `).run(error instanceof Error ? error.message : String(error), job.id);

      this.incidents.log({
        runId: job.run_id ?? undefined,
        severity: 'error',
        component: 'job-executor',
        summary: `Scheduled job ${job.id} failed`,
        details: { error: error instanceof Error ? error.message : String(error) },
      });
    } finally {
      db.close();
    }
  }
}
9. Per-team budgets