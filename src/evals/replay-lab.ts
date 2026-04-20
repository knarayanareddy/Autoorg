import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';

export class ReplayLab {
  private artifacts = new ImmutableArtifacts();

  async replayAttempt(opts: {
    attemptId: string;
    mode?: 'artifact_only' | 'tool_trace' | 'full_score_recompute';
  }) {
    const db = getDb();
    const row = db.prepare(`
      SELECT ba.*, bm.score, bm.groundedness, bm.gold_match, bm.cost_usd, bm.latency_ms
      FROM benchmark_attempts ba
      LEFT JOIN benchmark_metrics bm ON bm.attempt_id = ba.id
      WHERE ba.id = ?
    `).get(opts.attemptId) as any;

    if (!row) {
      db.close();
      throw new Error(`Benchmark attempt ${opts.attemptId} not found`);
    }

    const replayId = `rpl_${nanoid(10)}`;
    db.prepare(`
      INSERT INTO replay_sessions
      (id, source_run_id, source_attempt_id, mode, status, summary_json)
      VALUES (?, ?, ?, ?, 'running', '{}')
    `).run(replayId, row.autoorg_run_id ?? null, row.id, opts.mode ?? 'artifact_only');
    db.close();

    try {
      // Replay logic: in 'artifact_only' mode, we just retrieve the original artifacts
      const replay = {
        attemptId: row.id,
        autoorgRunId: row.autoorg_run_id,
        mode: opts.mode ?? 'artifact_only',
        originalMetrics: {
          score: row.score,
          groundedness: row.groundedness,
          goldMatch: row.gold_match,
          costUsd: row.cost_usd,
          latencyMs: row.latency_ms,
        },
      };

      const written = await this.artifacts.writeJson({
        runId: row.autoorg_run_id ?? row.id,
        relPath: `artifacts/benchmarks/replays/${replayId}.json`,
        data: replay,
        artifactKind: 'benchmark_replay',
      });

      const db2 = getDb();
      db2.prepare(`
        UPDATE replay_sessions
        SET status = 'completed', artifact_path = ?, summary_json = ?
        WHERE id = ?
      `).run(
        written.artifactPath,
        JSON.stringify({ attemptId: row.id, mode: opts.mode ?? 'artifact_only' }),
        replayId
      );
      db2.close();

      return { replayId, artifactPath: written.artifactPath };
    } catch (error) {
      const db3 = getDb();
      db3.prepare(`
        UPDATE replay_sessions
        SET status = 'failed', summary_json = ?
        WHERE id = ?
      `).run(
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
        replayId
      );
      db3.close();
      throw error;
    }
  }
}
