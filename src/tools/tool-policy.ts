import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export class ToolPolicy {
  constructor(private runId: string) {}

  seedDefaults(teamId?: string) {
    const defaults = [
      ['CEO', 'repo.search', 1],
      ['CEO', 'web.fetch', 1],
      ['CEO', 'github.search', 1],

      ['CoordinatorLead', 'repo.search', 1],
      ['CoordinatorLead', 'github.search', 1],

      ['Engineer', 'repo.search', 1],
      ['Engineer', 'repo.read_file', 1],
      ['Engineer', 'sandbox.exec', 1],

      ['Critic', 'repo.search', 1],
      ['Critic', 'repo.read_file', 1],
      ['Critic', 'web.fetch', 1],

      ['Archivist', 'repo.search', 1],
      ['Archivist', 'github.search', 1],

      ['DevilsAdvocate', 'repo.search', 1],
      ['DevilsAdvocate', 'web.fetch', 1],
    ] as const;

    const db = getDb();
    for (const [role, toolName] of defaults) {
      db.prepare(`
        INSERT OR IGNORE INTO tool_policies
        (id, run_id, team_id, role, tool_name, allowed, max_calls_per_cycle, max_calls_per_run, require_evidence)
        VALUES (?, ?, ?, ?, ?, 1, 4, 30, 1)
      `).run(`tp_${nanoid(8)}`, this.runId, teamId ?? null, role, toolName);
    }
    db.close();
  }

  isAllowed(opts: { role: string; toolName: string; teamId?: string }) {
    const db = getDb();
    const row = db.prepare(`
      SELECT allowed
      FROM tool_policies
      WHERE run_id = ? AND role = ? AND tool_name = ?
        AND (team_id = ? OR team_id IS NULL)
      ORDER BY CASE WHEN team_id IS NULL THEN 1 ELSE 0 END
      LIMIT 1
    `).get(this.runId, opts.role, opts.toolName, opts.teamId ?? null) as
      | { allowed: number }
      | undefined;
    db.close();
    return !!row?.allowed;
  }

  getLimit(opts: { role: string; toolName: string; teamId?: string }) {
    const db = getDb();
    const row = db.prepare(`
       SELECT max_calls_per_cycle
       FROM tool_policies
       WHERE run_id = ? AND role = ? AND tool_name = ?
         AND (team_id = ? OR team_id IS NULL)
       ORDER BY CASE WHEN team_id IS NULL THEN 1 ELSE 0 END
       LIMIT 1
    `).get(this.runId, opts.role, opts.toolName, opts.teamId ?? null) as { max_calls_per_cycle: number } | undefined;
    db.close();
    return row?.max_calls_per_cycle ?? 10;
  }

  countCycleCalls(opts: { runId: string; cycleNumber: number; role: string; toolName: string }) {
    const db = getDb();
    const row = db.prepare(`
      SELECT COUNT(*) as n
      FROM tool_executions
      WHERE run_id = ? AND cycle_number = ? AND role = ? AND tool_name = ?
        AND status != 'failed'
    `).get(opts.runId, opts.cycleNumber, opts.role, opts.toolName) as { n: number };
    db.close();
    return row.n;
  }
}
