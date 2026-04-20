TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export class BudgetManager {
  constructor(private runId: string) {}

  seedDefaults(teamId: string, opts?: {
    usdLimit?: number;
    tokenLimit?: number;
    toolCallLimit?: number;
    minuteLimit?: number;
  }) {
    const defaults = {
      usdLimit: opts?.usdLimit ?? 1.5,
      tokenLimit: opts?.tokenLimit ?? 40_000,
      toolCallLimit: opts?.toolCallLimit ?? 50,
      minuteLimit: opts?.minuteLimit ?? 20,
    };

    const entries = [
      ['usd', defaults.usdLimit],
      ['tokens', defaults.tokenLimit],
      ['tool_calls', defaults.toolCallLimit],
      ['minutes', defaults.minuteLimit],
    ] as const;

    const db = getDb();
    for (const [budgetType, limitValue] of entries) {
      db.prepare(`
        INSERT OR IGNORE INTO team_budgets
        (id, run_id, team_id, budget_type, window_scope, limit_value, consumed_value, hard_limit)
        VALUES (?, ?, ?, ?, 'run', ?, 0, 1)
      `).run(`bud_${nanoid(8)}`, this.runId, teamId, budgetType, limitValue);
    }
    db.close();
  }

  canSpend(teamId: string, budgetType: 'usd' | 'tokens' | 'tool_calls' | 'minutes', delta: number) {
    const db = getDb();
    const row = db.prepare(`
      SELECT limit_value, consumed_value, hard_limit
      FROM team_budgets
      WHERE run_id = ? AND team_id = ? AND budget_type = ?
      LIMIT 1
    `).get(this.runId, teamId, budgetType) as
      | { limit_value: number; consumed_value: number; hard_limit: number }
      | undefined;
    db.close();

    if (!row) return true;
    if (!row.hard_limit) return true;
    return row.consumed_value + delta <= row.limit_value;
  }

  spend(opts: {
    teamId: string;
    role?: string;
    cycleNumber?: number;
    budgetType: 'usd' | 'tokens' | 'tool_calls' | 'minutes';
    delta: number;
    reason: string;
    metadata?: Record<string, unknown>;
  }) {
    if (!this.canSpend(opts.teamId, opts.budgetType, opts.delta)) {
      throw new Error(`Budget exceeded for ${opts.teamId}/${opts.budgetType}`);
    }

    const db = getDb();
    db.prepare(`
      UPDATE team_budgets
      SET consumed_value = consumed_value + ?, updated_at = datetime('now')
      WHERE run_id = ? AND team_id = ? AND budget_type = ?
    `).run(opts.delta, this.runId, opts.teamId, opts.budgetType);

    db.prepare(`
      INSERT INTO budget_events
      (id, run_id, team_id, role, cycle_number, budget_type, delta_value, reason, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `be_${nanoid(8)}`,
      this.runId,
      opts.teamId,
      opts.role ?? null,
      opts.cycleNumber ?? null,
      opts.budgetType,
      opts.delta,
      opts.reason,
      JSON.stringify(opts.metadata ?? {})
    );

    db.close();
  }
}
10. Team memory partitions