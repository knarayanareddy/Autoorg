import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export type BudgetType = 'usd' | 'tokens' | 'tool_calls' | 'minutes';

export class BudgetManager {
  constructor(private runId: string) {}

  async track(opts: {
    teamId: string;
    role?: string;
    cycleNumber?: number;
    budgetType: BudgetType;
    delta: number;
    reason: string;
    metadata?: any;
  }) {
    const db = getDb();
    const eventId = `bud_${nanoid(10)}`;

    db.transaction(() => {
      // 1. Log event
      db.prepare(`
        INSERT INTO budget_events
        (id, run_id, team_id, role, cycle_number, budget_type, delta_value, reason, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        eventId,
        this.runId,
        opts.teamId,
        opts.role ?? null,
        opts.cycleNumber ?? null,
        opts.budgetType,
        opts.delta,
        opts.reason,
        JSON.stringify(opts.metadata ?? {})
      );

      // 2. Update consumption in team_budgets
      db.prepare(`
        UPDATE team_budgets
        SET consumed_value = consumed_value + ?, updated_at = datetime('now')
        WHERE run_id = ? AND team_id = ? AND budget_type = ?
      `).run(opts.delta, this.runId, opts.teamId, opts.budgetType);
    })();

    db.close();
  }

  async isOverBudget(teamId: string, budgetType: BudgetType): Promise<boolean> {
    const db = getDb();
    const row = db.prepare(`
      SELECT limit_value, consumed_value, hard_limit
      FROM team_budgets
      WHERE run_id = ? AND team_id = ? AND budget_type = ?
    `).get(this.runId, teamId, budgetType) as 
      | { limit_value: number; consumed_value: number; hard_limit: number }
      | undefined;

    db.close();

    if (!row) return false;
    if (row.hard_limit === 0) return false;

    return row.consumed_value >= row.limit_value;
  }

  async setLimit(opts: {
    teamId: string;
    budgetType: BudgetType;
    limit: number;
    window: 'run' | 'cycle';
    hardLimit?: boolean;
  }) {
    const db = getDb();
    const id = `tbl_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO team_budgets
      (id, run_id, team_id, budget_type, window_scope, limit_value, hard_limit)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, team_id, budget_type) DO UPDATE SET
        limit_value = excluded.limit_value,
        window_scope = excluded.window_scope,
        hard_limit = excluded.hard_limit,
        updated_at = datetime('now')
    `).run(
      id,
      this.runId,
      opts.teamId,
      opts.budgetType,
      opts.window,
      opts.limit,
      opts.hardLimit ? 1 : 0
    );

    db.close();
  }
}
