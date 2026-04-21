import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import simpleGit from 'simple-git';
import { getDb } from '@/db/migrate.js';
import { ApprovalGate } from '@/runtime/approval-gate.js';
import { WorkspaceLock } from '@/runtime/workspace-lock.js';
import { IncidentLog } from '@/runtime/incident-log.js';
import type { RatchetScore } from '@/types/index.js';

const PENDING_DIR = path.join(process.cwd(), 'artifacts', 'approvals', 'pending');
const MATERIALIZED_DIR = path.join(process.cwd(), 'artifacts', 'approvals', 'materialized');

export class ApprovalEnforcer {
  private gate = new ApprovalGate();
  private git = simpleGit();
  private lock = new WorkspaceLock();
  private incidents = new IncidentLog();

  constructor(private runId: string) {}

  async stageCommitCandidate(opts: {
    cycleNumber: number;
    targetFile: string;
    outputText: string;
    score: RatchetScore;
    summary: string;
  }) {
    await mkdir(PENDING_DIR, { recursive: true });
    await mkdir(MATERIALIZED_DIR, { recursive: true });

    const actionId = `act_${nanoid(10)}`;
    const snapshotPath = path.join(PENDING_DIR, `${actionId}.current_output.md`);
    const diffPath = path.join(PENDING_DIR, `${actionId}.patch`);
    const commitMessage = `cycle-${opts.cycleNumber}: score=${opts.score.composite.toFixed(4)}`;

    await writeFile(snapshotPath, opts.outputText, 'utf-8');

    const diff = await this.git.diff(['--binary', '--', opts.targetFile]);
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
        artifactPath: snapshotPath,
        diffPath,
        commitMessage,
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
      snapshotPath,
      diffPath,
      commitMessage,
      JSON.stringify({ score: opts.score, summary: opts.summary })
    );
    db.close();

    // HARD BLOCK:
    // Remove the candidate from the live working tree until approval exists.
    // This is what makes it "Strict"
    await this.git.checkout(['--', opts.targetFile]);

    return { actionId, approvalId, snapshotPath, diffPath };
  }

  async materializeApprovedActions() {
    const db = getDb();
    const rows = db.prepare(`
      SELECT pa.*, a.status AS approval_status
      FROM pending_actions pa
      JOIN approvals a ON a.id = pa.approval_id
      WHERE pa.status = 'staged' AND a.status = 'approved'
      ORDER BY pa.created_at ASC
    `).all() as any[];
    db.close();

    for (const row of rows) {
      await this.lock.withLock(
        `repo:${process.cwd()}`,
        `materializer:${row.id}`,
        row.run_id,
        async () => {
          if (row.action_type !== 'commit') return;

          const content = await readFile(row.artifact_path, 'utf-8');
          const targetFile = path.join(process.cwd(), 'workspace', 'current_output.md');
          await writeFile(targetFile, content, 'utf-8');
          
          await this.git.add([targetFile]);
          await this.git.commit(row.commit_message ?? `AutoOrg materialized ${row.id}`);
          
          await rename(
            row.artifact_path,
            path.join(MATERIALIZED_DIR, path.basename(row.artifact_path))
          );

          const db2 = getDb();
          db2.prepare(`
            UPDATE pending_actions
            SET status = 'materialized', materialized_at = datetime('now')
            WHERE id = ?
          `).run(row.id);
          db2.close();
        }
      );
    }
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
