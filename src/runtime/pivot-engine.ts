import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { PIVOT_PLANNER_SYSTEM_PROMPT, PivotPlanSchema } from '@/prompts/pivot-planner.js';

export class PivotEngine {
  constructor(private runId: string) {}

  async evaluatePivot(opts: {
    cycleNumber: number;
    scoreHistory: number[];
    currentOutput: string;
    objectives: any;
  }) {
    // Detect Plateau (e.g., no improvement > 2.5% in 3 cycles)
    const recentScores = opts.scoreHistory.slice(-3);
    const isPlateau = recentScores.length >= 3 && 
                     (Math.max(...recentScores) - Math.min(...recentScores)) < 0.025;

    if (!isPlateau) return null;

    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const proposal = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: PIVOT_PLANNER_SYSTEM_PROMPT },
        { 
          role: 'user', 
          content: JSON.stringify({
            runId: this.runId,
            cycle: opts.cycleNumber,
            scoreHistory: opts.scoreHistory,
            objectives: opts.objectives,
            outputSnippet: opts.currentOutput.slice(-5000),
          }, null, 2)
        },
      ],
      schema: PivotPlanSchema,
    });

    // Per User Decision: Auto-approve "minor" pivots, pend "major" ones.
    const isMajor = proposal.pivot_type === 'major';
    const status = isMajor ? 'pending' : 'auto_approved';

    const db = getDb();
    const pivotId = `piv_${nanoid(10)}`;
    db.prepare(`
      INSERT INTO strategic_pivots
      (id, run_id, cycle_number, pivot_type, reasoning_json, proposed_plan_md, approval_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      pivotId,
      this.runId,
      opts.cycleNumber,
      proposal.pivot_type,
      JSON.stringify(proposal),
      proposal.impact_on_mission_md,
      status
    );
    db.close();

    return { pivotId, proposal, status };
  }

  async applyPivot(pivotId: string) {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM strategic_pivots WHERE id = ?`).get(pivotId) as any;
    if (!row) { db.close(); return; }

    const proposal = JSON.parse(row.reasoning_json);

    // Apply model shifts if any
    if (proposal.suggested_model_shifts) {
      // In a real implementation, we would update the model_map in the run registry
    }

    // Apply role changes
    for (const change of proposal.suggested_role_changes) {
      if (change.action === 'add') {
        db.prepare(`
          INSERT INTO dynamic_roles (id, run_id, role_name, assignment_reason, assigned_at_cycle)
          VALUES (?, ?, ?, ?, ?)
        `).run(`dr_${nanoid(10)}`, this.runId, change.role, change.reason, row.cycle_number);
      }
    }

    db.prepare(`
        UPDATE strategic_pivots 
        SET approval_status = 'approved', applied_at = datetime('now') 
        WHERE id = ?
    `).run(pivotId);
    db.close();
  }
}
