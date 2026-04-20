import { getDb } from '@/db/migrate.js';

export class ServiceState {
  start(pid: number, currentRunId?: string) {
    const db = getDb();
    db.prepare(`
      UPDATE daemon_state
      SET status='running', pid=?, current_run_id=?, last_heartbeat=datetime('now'),
          updated_at=datetime('now')
      WHERE id='daemon_default'
    `).run(pid, currentRunId ?? null);
    db.close();
  }

  heartbeat(currentRunId?: string) {
    const db = getDb();
    db.prepare(`
      UPDATE daemon_state
      SET last_heartbeat=datetime('now'), current_run_id=?, updated_at=datetime('now')
      WHERE id='daemon_default'
    `).run(currentRunId ?? null);
    db.close();
  }

  stop() {
    const db = getDb();
    db.prepare(`
      UPDATE daemon_state
      SET status='stopped', current_run_id=NULL, updated_at=datetime('now')
      WHERE id='daemon_default'
    `).run();
    db.close();
  }

  error(message: string) {
    const db = getDb();
    db.prepare(`
      UPDATE daemon_state
      SET status='error', metadata_json=?, updated_at=datetime('now')
      WHERE id='daemon_default'
    `).run(JSON.stringify({ error: message.slice(0, 1000) }));
    db.close();
  }

  get() {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM daemon_state WHERE id='daemon_default'`).get();
    db.close();
    return row;
  }
}
