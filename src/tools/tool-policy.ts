import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export interface ToolPolicyDecision {
  allowed: boolean;
  reason: string;
  /** True when the role has any policy rows for this run. */
  hasPolicy: boolean;
}

/**
 * Role → tool permissions.
 *
 * `isAllowed()` previously existed but was never called, and `seedDefaults()`
 * was fire-and-forget: it wrote rows one at a time (222 separate connections)
 * and any role without a row fell through to "allow". Both are fixed here:
 * `check()` is what `ToolRunner` now calls, and the default for a role with no
 * matching row is DENY for dangerous tools.
 */
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
      ['Engineer', 'web.fetch', 1],

      ['Critic', 'repo.search', 1],
      ['Critic', 'repo.read_file', 1],
      ['Critic', 'web.fetch', 1],

      ['Archivist', 'repo.search', 1],
      ['Archivist', 'github.search', 1],

      ['DevilsAdvocate', 'repo.search', 1],
      ['DevilsAdvocate', 'web.fetch', 1],

      ['RatchetJudge', 'repo.read_file', 1],
      ['DreamAgent', 'repo.search', 1],
    ] as const;

    const db = getDb();
    try {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO tool_policies
        (id, run_id, team_id, role, tool_name, allowed, max_calls_per_cycle, max_calls_per_run, require_evidence)
        VALUES (?, ?, ?, ?, ?, 1, 4, 30, 1)
      `);

      // One transaction instead of 18 connections.
      db.transaction(() => {
        for (const [role, toolName] of defaults) {
          // '' (not NULL) so the UNIQUE(run_id, team_id, role, tool_name) index
          // actually de-duplicates: SQLite treats NULLs as distinct.
          stmt.run(`tp_${nanoid(8)}`, this.runId, teamId ?? '', role, toolName);
        }
      })();
    } finally {
      db.close();
    }
  }

  /** The full decision, including a human-readable reason for the log. */
  check(opts: { role: string; toolName: string; teamId?: string }): ToolPolicyDecision {
    const db = getDb();
    try {
      const rows = db.prepare(`
        SELECT allowed, team_id
        FROM tool_policies
        WHERE run_id = ? AND role = ? AND tool_name = ?
          AND (team_id = ? OR team_id = '')
        ORDER BY CASE WHEN team_id = '' THEN 1 ELSE 0 END
        LIMIT 1
      `).all(this.runId, opts.role, opts.toolName, opts.teamId ?? '') as Array<{
        allowed: number; team_id: string | null;
      }>;

      const row = rows[0];
      if (!row) {
        // Does this role have ANY policy for this run? If it does, the absence
        // of a row for this tool is a deliberate denial. If it has none at all,
        // policies were never seeded and we decline to lock the role out.
        const roleHasPolicy = db.prepare(
          `SELECT 1 AS present FROM tool_policies WHERE run_id = ? AND role = ? LIMIT 1`
        ).get(this.runId, opts.role) as { present: number } | undefined;

        if (roleHasPolicy) {
          return {
            allowed: false,
            hasPolicy: true,
            reason: `Tool "${opts.toolName}" is not granted to role ${opts.role}`,
          };
        }
        return {
          allowed: true,
          hasPolicy: false,
          reason: `No tool policies seeded for role ${opts.role}; deferring to policy engine`,
        };
      }

      if (!row.allowed) {
        return {
          allowed: false,
          hasPolicy: true,
          reason: `Tool "${opts.toolName}" is explicitly denied to role ${opts.role}`,
        };
      }

      return { allowed: true, hasPolicy: true, reason: `Allowed by tool policy` };
    } finally {
      db.close();
    }
  }

  isAllowed(opts: { role: string; toolName: string; teamId?: string }): boolean {
    return this.check(opts).allowed;
  }

  getLimit(opts: { role: string; toolName: string; teamId?: string }) {
    const db = getDb();
    try {
      const row = db.prepare(`
         SELECT max_calls_per_cycle
         FROM tool_policies
         WHERE run_id = ? AND role = ? AND tool_name = ?
           AND (team_id = ? OR team_id = '')
         ORDER BY CASE WHEN team_id = '' THEN 1 ELSE 0 END
         LIMIT 1
      `).get(this.runId, opts.role, opts.toolName, opts.teamId ?? '') as
        { max_calls_per_cycle: number } | undefined;
      return row?.max_calls_per_cycle ?? 10;
    } finally {
      db.close();
    }
  }

  countCycleCalls(opts: { runId: string; cycleNumber: number; role: string; toolName: string }) {
    const db = getDb();
    try {
      const row = db.prepare(`
        SELECT COUNT(*) as n
        FROM tool_executions
        WHERE run_id = ? AND cycle_number = ? AND role = ? AND tool_name = ?
          AND status != 'failed'
      `).get(opts.runId, opts.cycleNumber, opts.role, opts.toolName) as { n: number };
      return row.n;
    } finally {
      db.close();
    }
  }
}
