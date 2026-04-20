TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export interface CheckpointPayload {
  bestScore: number;
  plateauCount: number;
  consecutiveRejects: number;
  cycleNumber: number;
  stage: string;
  extra?: Record<string, unknown>;
}

export class RecoveryJournal {
  constructor(private runId: string) {}

  checkpoint(payload: CheckpointPayload, gitHead?: string) {
    const db = getDb();
    db.prepare(`
      INSERT INTO run_checkpoints
      (id, run_id, cycle_number, stage, state_json, git_head, best_score, plateau_count, consecutive_rejects)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `chk_${nanoid(10)}`,
      this.runId,
      payload.cycleNumber,
      payload.stage,
      JSON.stringify(payload),
      gitHead ?? null,
      payload.bestScore,
      payload.plateauCount,
      payload.consecutiveRejects
    );
    db.close();
  }

  latest() {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM run_checkpoints
      WHERE run_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(this.runId) as { state_json: string } | undefined;
    db.close();
    return row ? JSON.parse(row.state_json) as CheckpointPayload : null;
  }

  recordEvent(eventType: string, summary: string, details: Record<string, unknown> = {}) {
    const db = getDb();
    db.prepare(`
      INSERT INTO recovery_events
      (id, run_id, event_type, summary, details_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      `rec_${nanoid(10)}`,
      this.runId,
      eventType,
      summary,
      JSON.stringify(details)
    );
    db.close();
  }
}