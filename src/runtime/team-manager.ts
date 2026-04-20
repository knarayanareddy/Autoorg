import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export interface TeamDefinition {
  name: string;
  mission: string;
  workerRoles: string[];
  parentTeamId?: string | null;
}

export class TeamManager {
  private runId: string;

  constructor(runId: string) {
    this.runId = runId;
  }

  createTeam(def: TeamDefinition, cycleNumber: number): string {
    const teamId = `team_${nanoid(8)}`;
    const db = getDb();

    db.prepare(`
      INSERT INTO teams (id, run_id, name, lead_role, mission, active, created_cycle, parent_team_id)
      VALUES (?, ?, ?, 'CoordinatorLead', ?, 1, ?, ?)
    `).run(
      teamId,
      this.runId,
      def.name,
      def.mission,
      cycleNumber,
      def.parentTeamId ?? null
    );

    const memberStmt = db.prepare(`
      INSERT INTO team_members (id, team_id, role) VALUES (?, ?, ?)
    `);

    const tx = db.transaction(() => {
      for (const role of def.workerRoles) {
        memberStmt.run(`tm_${nanoid(8)}`, teamId, role);
      }
    });

    tx();
    db.close();

    return teamId;
  }

  listTeams() {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM teams WHERE run_id = ? AND active = 1 ORDER BY created_at ASC
    `).all(this.runId) as any[];
    db.close();
    return rows;
  }

  getTeamMembers(teamId: string): string[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT role FROM team_members WHERE team_id = ?
    `).all(teamId) as Array<{ role: string }>;
    db.close();
    return rows.map(r => r.role);
  }

  createDelegatedTask(opts: {
    cycleNumber: number;
    fromRole: string;
    toRole: string;
    teamId?: string;
    taskType: string;
    instruction: string;
  }): string {
    const id = `dt_${nanoid(8)}`;
    const db = getDb();
    db.prepare(`
      INSERT INTO delegated_tasks
        (id, run_id, cycle_number, from_role, to_role, team_id, task_type, instruction, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      id,
      this.runId,
      opts.cycleNumber,
      opts.fromRole,
      opts.toRole,
      opts.teamId ?? null,
      opts.taskType,
      opts.instruction
    );
    db.close();
    return id;
  }

  markDelegatedTaskComplete(id: string, summary: string) {
    const db = getDb();
    db.prepare(`
      UPDATE delegated_tasks
      SET status = 'completed', result_summary = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(summary, id);
    db.close();
  }

  getPendingTasks(cycleNumber: number) {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM delegated_tasks 
      WHERE run_id = ? AND cycle_number = ? AND status = 'pending'
    `).all(this.runId, cycleNumber) as any[];
    db.close();
    return rows;
  }
}
