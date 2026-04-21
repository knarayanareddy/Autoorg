import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export interface CheckpointPayload {
  bestScore: number;
  plateauCount: number;
  consecutiveRejects: number;
  cycleNumber: number;
  stage: string;
}

export class RecoveryJournal {
  constructor(private runId: string) {}

  async save(opts: {
    cycleNumber: number;
    stage: 'boot' | 'pre_cycle' | 'post_team_assignment' | 'post_workers' | 'post_score' | 'post_decision' | 'post_dream' | 'idle';
    state: CheckpointPayload;
    gitHead?: string;
  }) {
    const db = getDb();
    const id = `chk_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO run_checkpoints
      (id, run_id, cycle_number, stage, state_json, git_head, best_score, plateau_count, consecutive_rejects)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      this.runId,
      opts.cycleNumber,
      opts.stage,
      JSON.stringify(opts.state),
      opts.gitHead ?? null,
      opts.state.bestScore,
      opts.state.plateauCount,
      opts.state.consecutiveRejects
    );

    db.close();
  }

  async getLatestCheckpoint(): Promise<(CheckpointPayload & { gitHead?: string }) | null> {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM run_checkpoints
      WHERE run_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(this.runId) as any;

    db.close();

    if (!row) return null;

    try {
      const state = JSON.parse(row.state_json);
      return {
        ...state,
        gitHead: row.git_head,
      };
    } catch {
      return null;
    }
  }

  async logCrash(summary: string, details: any = {}) {
    const db = getDb();
    const id = `rec_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO recovery_events
      (id, run_id, event_type, summary, details_json)
      VALUES (?, ?, 'crash_detected', ?, ?)
    `).run(id, this.runId, summary, JSON.stringify(details));

    db.close();
  }
}
