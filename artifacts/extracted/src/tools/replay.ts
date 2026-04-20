TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export class ToolReplay {
  async replay(executionId: string, mode: 'artifact_only' | 'full_rerun' = 'artifact_only') {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM tool_executions WHERE id = ?
    `).get(executionId) as
      | { artifact_path: string | null; tool_name: string; input_json: string | null }
      | undefined;

    if (!row) {
      db.close();
      throw new Error(`Tool execution ${executionId} not found`);
    }

    const replayId = `tr_${nanoid(10)}`;
    db.prepare(`
      INSERT INTO tool_replays
      (id, execution_id, replay_mode, status)
      VALUES (?, ?, ?, 'started')
    `).run(replayId, executionId, mode);
    db.close();

    try {
      if (mode === 'artifact_only') {
        const output = row.artifact_path ? await Bun.file(row.artifact_path).json() : null;
        const db2 = getDb();
        db2.prepare(`
          UPDATE tool_replays
          SET status = 'completed', output_json = ?
          WHERE id = ?
        `).run(JSON.stringify(output), replayId);
        db2.close();
        return output;
      }

      throw new Error('full_rerun not yet implemented in Phase 6 baseline');
    } catch (error) {
      const db3 = getDb();
      db3.prepare(`
        UPDATE tool_replays
        SET status = 'failed', error_text = ?
        WHERE id = ?
      `).run(error instanceof Error ? error.message : String(error), replayId);
      db3.close();
      throw error;
    }
  }
}
10. Tool planning prompt