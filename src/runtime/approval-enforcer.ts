import { cp, mkdir, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import simpleGit from 'simple-git';
import { getDb } from '@/db/migrate.js';
import { ApprovalGate } from '@/runtime/approval-gate.js';
import { WorkspaceLock } from '@/runtime/workspace-lock.js';
import { IncidentLog } from '@/runtime/incident-log.js';
import { gitCommit, gitReset } from '@/utils/git.js';
import { logCycleResult } from '@/utils/results-logger.js';
import type { RatchetScore } from '@/types/index.js';

/**
 * Computed at CALL time (not module load): tests chdir into a throwaway
 * repo, and the API server may start in a different cwd than later work.
 */
const pendingDir = () => path.join(process.cwd(), 'artifacts', 'approvals', 'pending');
const materializedDir = () => path.join(process.cwd(), 'artifacts', 'approvals', 'materialized');

/**
 * The exact set `gitCommit()` stages. Staging snapshots these paths and
 * materialization replays them, so an approved candidate lands through the
 * same code path (same staging set, same message contract) as a direct
 * ratchet commit — the enforcer never invents its own commit shape.
 */
const STAGING_SET = [
  'workspace/current_output.md',
  'memory/MEMORY.md',
  'memory/facts',
  'results.tsv',
];

export class ApprovalEnforcer {
  private gate = new ApprovalGate();
  private git = simpleGit();
  private lock = new WorkspaceLock();
  private incidents = new IncidentLog();

  constructor(private runId: string) {}

  /**
   * Freeze a COMMIT-worthy candidate: snapshot every path `gitCommit()`
   * would stage, save the review patch, request approval, then pull the
   * working tree back to HEAD. Until a human approves, the candidate exists
   * only under `artifacts/approvals/pending/` — the repo looks exactly as it
   * does after a REVERT.
   */
  async stageCommitCandidate(opts: {
    cycleNumber: number;
    score: RatchetScore;
    summary: string;
    commitMessage: string;
  }) {
    await mkdir(pendingDir(), { recursive: true });
    await mkdir(materializedDir(), { recursive: true });

    const actionId = `act_${nanoid(10)}`;
    const snapshotDir = path.join(pendingDir(), actionId);
    const diffPath = path.join(pendingDir(), `${actionId}.patch`);
    await mkdir(snapshotDir, { recursive: true });

    for (const rel of STAGING_SET) {
      const abs = path.join(process.cwd(), rel);
      if (existsSync(abs)) {
        await cp(abs, path.join(snapshotDir, rel), { recursive: true });
      }
    }

    const diff = await this.git.diff(['--binary', 'HEAD']);
    await writeFile(diffPath, diff, 'utf-8');

    const approvalId = this.gate.request({
      runId: this.runId,
      cycleNumber: opts.cycleNumber,
      approvalType: 'commit',
      subject: actionId,
      requestedBy: 'system',
      summary: `Cycle ${opts.cycleNumber} requests COMMIT at ${opts.score.composite.toFixed(4)}.`,
      details: {
        score: opts.score,
        artifactPath: snapshotDir,
        diffPath,
        commitMessage: opts.commitMessage,
        summary: opts.summary,
      },
    });

    const db = getDb();
    db.prepare(`
      INSERT INTO pending_actions
      (id, approval_id, run_id, cycle_number, action_type, status, artifact_path, diff_path, commit_message, metadata_json)
      VALUES (?, ?, ?, ?, 'commit', 'staged', ?, ?, ?, ?)
    `).run(
      actionId,
      approvalId,
      this.runId,
      opts.cycleNumber,
      snapshotDir,
      diffPath,
      opts.commitMessage,
      JSON.stringify({ score: opts.score, summary: opts.summary })
    );
    db.close();

    // HARD BLOCK: return the live tree to HEAD — identical to a REVERT —
    // so nothing in the workspace reflects unapproved work.
    await gitReset();

    return { actionId, approvalId, snapshotDir, diffPath };
  }

  /**
   * Land every staged candidate whose approval flipped to `approved`.
   * Restores the snapshot, commits through the shared `gitCommit()` path,
   * flips the cycle's limbo rows to COMMIT, and supersedes older staged
   * candidates of the same run (replaying them would clobber newer work).
   */
  async materializeApprovedActions(): Promise<string[]> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT pa.*, a.status AS approval_status
      FROM pending_actions pa
      JOIN approvals a ON a.id = pa.approval_id
      WHERE pa.status = 'staged' AND a.status = 'approved'
      ORDER BY pa.created_at ASC
    `).all() as any[];
    db.close();

    const materialized: string[] = [];

    for (const row of rows) {
      await this.lock.withLock(
        `repo:${process.cwd()}`,
        `materializer:${row.id}`,
        row.run_id,
        async () => {
          if (row.action_type !== 'commit') return;

          // 1. Replay the approved snapshot over the working tree.
          for (const rel of STAGING_SET) {
            const snapshotted = path.join(row.artifact_path, rel);
            if (existsSync(snapshotted)) {
              await cp(snapshotted, path.join(process.cwd(), rel), {
                recursive: true,
                force: true,
              });
            }
          }

          // 2. Record the landed decision in results.tsv BEFORE committing,
          //    so the commit ships with the row that raises the best score.
          let metadata: { score?: RatchetScore; summary?: string } = {};
          try { metadata = JSON.parse(row.metadata_json ?? '{}'); } catch { /* keep {} */ }
          if (metadata.score) {
            await logCycleResult(
              row.cycle_number,
              { ...metadata.score, decision: 'COMMIT' },
              0,
              metadata.summary ?? row.commit_message ?? ''
            );
          }

          // 3. The single commit path: same staging set, same message rules.
          const commitHash = await gitCommit(
            row.commit_message ?? `materialize ${row.id}`
          );

          // 4. Close the loop in the DB — cycle, score history, action row.
          const db2 = getDb();
          db2.prepare(`
            UPDATE cycles
            SET decision='COMMIT', git_commit_hash=?
            WHERE run_id=? AND cycle_number=? AND decision='PENDING_APPROVAL'
          `).run(commitHash, row.run_id, row.cycle_number);
          db2.prepare(`
            UPDATE score_history
            SET decision='COMMIT'
            WHERE run_id=? AND cycle_number=?
          `).run(row.run_id, row.cycle_number);
          db2.prepare(`
            UPDATE pending_actions
            SET status='expired',
                error_text='superseded by a newer materialized candidate'
            WHERE status='staged' AND run_id=? AND cycle_number < ?
          `).run(row.run_id, row.cycle_number);
          db2.prepare(`
            UPDATE pending_actions
            SET status='materialized', materialized_at=datetime('now')
            WHERE id = ?
          `).run(row.id);
          db2.close();

          // 5. Retire the snapshot out of the pending/ queue.
          await rename(
            row.artifact_path,
            path.join(materializedDir(), path.basename(row.artifact_path))
          );

          this.incidents.log({
            runId: row.run_id,
            severity: 'info',
            component: 'approval-enforcer',
            summary: `Materialized approved cycle ${row.cycle_number} candidate`,
            details: { actionId: row.id, commitHash },
          });

          materialized.push(row.id);
        }
      );
    }

    return materialized;
  }

  async rejectAction(actionId: string, reason: string) {
    const db = getDb();
    db.prepare(`
      UPDATE pending_actions
      SET status = 'rejected', error_text = ?
      WHERE id = ?
    `).run(reason, actionId);
    db.close();

    this.incidents.log({
      runId: this.runId,
      severity: 'info',
      component: 'approval-enforcer',
      summary: `Pending action ${actionId} rejected`,
      details: { reason },
    });
  }
}
