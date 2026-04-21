import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export interface Incident {
  runId: string | null;
  severity: 'info' | 'warn' | 'error' | 'critical';
  component: string;
  summary: string;
  details?: any;
}

export class IncidentLog {
  log(opts: Incident) {
    const db = getDb();
    const id = `inc_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO incident_log
      (id, run_id, severity, component, summary, details_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      opts.runId,
      opts.severity,
      opts.component,
      opts.summary,
      JSON.stringify(opts.details ?? {})
    );

    db.close();
  }

  resolve(incidentId: string) {
    const db = getDb();
    db.prepare(`
      UPDATE incident_log
      SET resolved = 1
      WHERE id = ?
    `).run(incidentId);
    db.close();
  }
}
