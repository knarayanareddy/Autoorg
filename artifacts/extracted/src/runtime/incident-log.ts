TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export class IncidentLog {
  log(opts: {
    runId?: string;
    severity: 'info' | 'warn' | 'error' | 'critical';
    component: string;
    summary: string;
    details?: Record<string, unknown>;
  }) {
    const db = getDb();
    db.prepare(`
      INSERT INTO incident_log
      (id, run_id, severity, component, summary, details_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `inc_${nanoid(10)}`,
      opts.runId ?? null,
      opts.severity,
      opts.component,
      opts.summary,
      JSON.stringify(opts.details ?? {})
    );
    db.close();
  }
}
8. Actual scheduled job execution