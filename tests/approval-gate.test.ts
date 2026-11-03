/**
 * Approval-gated commits — OWASP A01/A08 (strict-approval path was dead code).
 *
 * `ratchet.ts` used to `gitCommit()` on the LLM score alone; the
 * ApprovalEnforcer existed but nobody called it. The contract now:
 *
 *   1. A COMMIT-worthy cycle is STAGED (snapshot + patch + approval request),
 *      the working tree returns to HEAD, and the cycle is recorded as
 *      `PENDING_APPROVAL` — nothing lands without a human.
 *   2. Approving restores the snapshot and commits through the shared
 *      `gitCommit()` path (same staging set, same message format).
 *   3. The approve/reject endpoints return 404 for unknown IDs.
 *   4. A newer materialized candidate supersedes older staged ones.
 *
 * The git-facing tests run inside a throwaway repository (chdir in
 * beforeAll), so the agent's own working tree is never touched.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { execSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { RatchetEngine } from '../src/runtime/ratchet.ts';
import { ApprovalGate } from '../src/runtime/approval-gate.ts';
import { handleApprovalDecision } from '../src/api/approval-routes.ts';
import { getBestScore } from '../src/utils/results-logger.ts';
import { getDb } from '../src/db/migrate.ts';
import type { CycleState, RatchetScore } from '../src/types/index.ts';
import { useTestDb, cleanupTestDb, testRunId } from './helpers/test-db.ts';

const RUN_ID = testRunId('approval');
const ratchet = new RatchetEngine();

let repo: string;
let originalCwd = process.cwd();

function git(cmd: string): string {
  return execSync(`git ${cmd}`, { cwd: repo, encoding: 'utf-8' }).trim();
}

function head(): string {
  return git('rev-parse HEAD');
}

function fileContent(rel: string): string {
  return readFileSync(path.join(repo, rel), 'utf-8');
}

function insertRunAndCycle(cycleId: string, cycleNumber: number): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO runs (id, status, config_json, org_md_hash, org_md_path)
     VALUES (?, 'running', '{}', 'hash', 'org.md')`
  ).run(RUN_ID);
  db.prepare(
    `INSERT INTO cycles (id, run_id, cycle_number) VALUES (?, ?, ?)`
  ).run(cycleId, RUN_ID, cycleNumber);
  db.close();
}

function makeScore(composite: number, decision: RatchetScore['decision'] = 'COMMIT'): RatchetScore {
  return {
    groundedness: 0.9, novelty: 0.9, consistency: 0.9, alignment: 0.9,
    composite, decision,
    justification: `score ${composite.toFixed(4)} vs previous best`,
    objections: [], blockerCount: 0, majorCount: 0,
  };
}

function cycleState(id: string, cycleNumber: number): CycleState {
  return {
    id, runId: RUN_ID, cycleNumber, phase: 'ratchet',
    previousBestScore: 0.1, totalCostUsd: 0, totalTokens: 0,
    startedAt: new Date(),
  };
}

function approvalRows(): Array<Record<string, any>> {
  const db = getDb();
  const rows = db.prepare(
    `SELECT * FROM approvals WHERE run_id = ? ORDER BY requested_at ASC`
  ).all(RUN_ID) as Array<Record<string, any>>;
  db.close();
  return rows;
}

function pendingActionRows(): Array<Record<string, any>> {
  const db = getDb();
  const rows = db.prepare(
    `SELECT * FROM pending_actions WHERE run_id = ? ORDER BY created_at ASC`
  ).all(RUN_ID) as Array<Record<string, any>>;
  db.close();
  return rows;
}

function cycleDecision(cycleId: string): { decision: string | null; git_commit_hash: string | null } {
  const db = getDb();
  const row = db.prepare(`SELECT decision, git_commit_hash FROM cycles WHERE id = ?`).get(cycleId) as
    { decision: string | null; git_commit_hash: string | null };
  db.close();
  return row;
}

beforeAll(async () => {
  await useTestDb('autoorg-approval-');

  // Throwaway git repository standing in for the workspace.
  originalCwd = process.cwd();
  repo = mkdtempSync(path.join(tmpdir(), 'autoorg-approval-repo-'));
  const run = (cmd: string) => execSync(cmd, { cwd: repo, stdio: 'pipe' });
  run('git init -q');
  run('git config user.email test@autoorg.local');
  run('git config user.name AutoOrgTest');
  mkdirSync(path.join(repo, 'workspace'), { recursive: true });
  mkdirSync(path.join(repo, 'memory', 'facts'), { recursive: true });
  // Mirror the real repo: approval snapshots/patches are ignored, not tracked.
  writeFileSync(path.join(repo, '.gitignore'), 'artifacts/\n');
  writeFileSync(path.join(repo, 'workspace', 'current_output.md'), 'baseline output v1');
  writeFileSync(path.join(repo, 'memory', 'MEMORY.md'), 'Best score: 0.1000');
  writeFileSync(path.join(repo, 'memory', 'facts', 'fact.md'), 'fact one');
  run('git add -A');
  run('git commit -q -m "chore: baseline"');
  // Dirty the tree the way a finished cycle would before keepOrRevert.
  writeFileSync(path.join(repo, 'workspace', 'current_output.md'), 'IMPROVED output v2 (candidate)');
  writeFileSync(path.join(repo, 'memory', 'MEMORY.md'), 'Best score: 0.9000');

  process.chdir(repo);
});

afterAll(() => {
  process.chdir(originalCwd);
  cleanupTestDb();
  if (repo && existsSync(repo)) rmSync(repo, { recursive: true, force: true });
});

describe('keepOrRevert stages commits instead of landing them (A01)', () => {
  it('returns PENDING_APPROVAL, keeps HEAD, and reverts the working tree', async () => {
    insertRunAndCycle('cy_appr_1', 1);
    const baseline = head();

    const result = await ratchet.keepOrRevert(makeScore(0.9), 0.1, cycleState('cy_appr_1', 1));

    expect(result.decision).toBe('PENDING_APPROVAL');
    expect(result.commitHash).toBeUndefined();

    // Nothing landed, and the candidate was pulled out of the live tree.
    expect(head()).toBe(baseline);
    expect(fileContent('workspace/current_output.md')).toBe('baseline output v1');
    // Only keepOrRevert's own fresh results.tsv row may be untracked here —
    // no candidate content survives in the working tree.
    const dirty = git('status --porcelain')
      .split('\n')
      .filter(line => line.trim() && !line.includes('results.tsv'));
    expect(dirty).toEqual([]);

    // Cycle row carries the third outcome (requires the 003 CHECK extension).
    const cycle = cycleDecision('cy_appr_1');
    expect(cycle.decision).toBe('PENDING_APPROVAL');
    expect(cycle.git_commit_hash).toBeNull();
  });

  it('records a pending approval with snapshot, patch and the ratchet message', () => {
    const approvals = approvalRows().filter(a => a.status === 'pending');
    expect(approvals.length).toBe(1);
    const details = JSON.parse(approvals[0]!.details_json);
    expect(details.commitMessage).toMatch(/^autoorg-cycle-1: score=0\.9000 \(prev=0\.1000\)/);

    const actions = pendingActionRows();
    expect(actions.length).toBe(1);
    expect(actions[0]!.status).toBe('staged');
    expect(actions[0]!.commit_message).toBe(details.commitMessage);

    // Snapshot holds the candidate; patch shows the delta for review.
    const snapshot = path.join(actions[0]!.artifact_path, 'workspace', 'current_output.md');
    expect(readFileSync(snapshot, 'utf-8')).toBe('IMPROVED output v2 (candidate)');
    expect(readFileSync(actions[0]!.diff_path, 'utf-8')).toContain('IMPROVED output v2');
  });

  it('logs the cycle as pending — it does NOT raise the best score', async () => {
    const results = readFileSync(path.join(repo, 'results.tsv'), 'utf-8');
    expect(results).toContain('PENDING_APPROVAL');
    expect(results).not.toMatch(/\tCOMMIT\t/);
    expect(await getBestScore()).toBe(0);
  });
});

describe('approve/reject endpoints (unknown IDs must 404)', () => {
  it('ApprovalGate.approve returns false for an unknown id', () => {
    expect(new ApprovalGate().approve('ap_does_not_exist')).toBe(false);
  });

  it('ApprovalGate.reject returns false for an unknown id', () => {
    expect(new ApprovalGate().reject('ap_does_not_exist')).toBe(false);
  });

  it('handleApprovalDecision returns 404 for an unknown id (approve)', async () => {
    const res = await handleApprovalDecision({ id: 'ap_nope', action: 'approve' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('handleApprovalDecision returns 404 for an unknown id (reject)', async () => {
    const res = await handleApprovalDecision({ id: 'ap_nope', action: 'reject' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

describe('approving materializes the staged candidate', () => {
  it('lands the approved snapshot via the shared gitCommit path', async () => {
    const approval = approvalRows().find(a => a.status === 'pending')!;
    const before = head();

    const res = await handleApprovalDecision({ id: approval.id, action: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');

    // The snapshot landed: content, message format, staging set.
    expect(head()).not.toBe(before);
    expect(fileContent('workspace/current_output.md')).toBe('IMPROVED output v2 (candidate)');
    const message = git('log -1 --format=%s');
    expect(message).toMatch(/^autoorg-cycle-1: score=0\.9000/);

    const action = pendingActionRows()[0]!;
    expect(action.status).toBe('materialized');
    expect(existsSync(action.artifact_path)).toBe(false); // moved out of pending/

    // DB state caught up: cycle committed, results row now counts.
    const cycle = cycleDecision('cy_appr_1');
    expect(cycle.decision).toBe('COMMIT');
    expect(cycle.git_commit_hash).toBeTruthy();
    expect(await getBestScore()).toBeCloseTo(0.9, 4);
  });

  it('a REVERT cycle still resets and records REVERT (no approval involved)', async () => {
    insertRunAndCycle('cy_appr_2', 2);
    const before = head();
    writeFileSync(path.join(repo, 'workspace', 'current_output.md'), 'BADCANDIDATE v3');

    const result = await ratchet.keepOrRevert(
      makeScore(0.4, 'REVERT'), 0.9, cycleState('cy_appr_2', 2)
    );

    expect(result.decision).toBe('REVERT');
    expect(head()).toBe(before);
    expect(fileContent('workspace/current_output.md')).toBe('IMPROVED output v2 (candidate)');
    expect(cycleDecision('cy_appr_2').decision).toBe('REVERT');
    expect(approvalRows().length).toBe(1); // no new approval for REVERTs
  });

  it('a newer materialized candidate supersedes older staged ones', async () => {
    // Stage cycle 3 …
    insertRunAndCycle('cy_appr_3', 3);
    writeFileSync(path.join(repo, 'workspace', 'current_output.md'), 'CANDIDATE v4 (cycle 3)');
    const r3 = await ratchet.keepOrRevert(makeScore(0.95), 0.9, cycleState('cy_appr_3', 3));
    expect(r3.decision).toBe('PENDING_APPROVAL');

    // … then stage cycle 4 …
    insertRunAndCycle('cy_appr_4', 4);
    writeFileSync(path.join(repo, 'workspace', 'current_output.md'), 'CANDIDATE v5 (cycle 4)');
    const r4 = await ratchet.keepOrRevert(makeScore(0.96), 0.9, cycleState('cy_appr_4', 4));
    expect(r4.decision).toBe('PENDING_APPROVAL');

    const approvals = approvalRows().filter(a => a.status === 'pending');
    expect(approvals.length).toBe(2);
    const [appr3, appr4] = approvals;

    // Human approves the NEWER one first.
    const res = await handleApprovalDecision({ id: appr4!.id, action: 'approve' });
    expect(res.status).toBe(200);
    expect(fileContent('workspace/current_output.md')).toBe('CANDIDATE v5 (cycle 4)');
    expect(cycleDecision('cy_appr_4').decision).toBe('COMMIT');

    // The older staged candidate is superseded — it must not clobber v5.
    const actions = pendingActionRows();
    const action3 = actions.find(a => a.cycle_number === 3)!;
    const action4 = actions.find(a => a.cycle_number === 4)!;
    expect(action4.status).toBe('materialized');
    expect(action3.status).toBe('expired');
    expect(action3.error_text).toContain('superseded');

    const headBefore = head();
    const res3 = await handleApprovalDecision({ id: appr3!.id, action: 'approve' });
    expect(res3.status).toBe(200); // the approval itself is known …
    expect(head()).toBe(headBefore); // … but nothing may land out of order
    expect(fileContent('workspace/current_output.md')).toBe('CANDIDATE v5 (cycle 4)');
    expect(cycleDecision('cy_appr_3').decision).toBe('PENDING_APPROVAL');
  });
});
