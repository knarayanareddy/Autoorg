TypeScript

import { nanoid } from 'nanoid';
import { createHash } from 'node:crypto';
import { getDb } from '@/db/migrate.js';
import type { ActionClass } from '@/runtime/policy-engine.js';
import type { RiskTier } from '@/runtime/risk-engine.js';

function sha(input: unknown) {
  return createHash('sha256').update(
    typeof input === 'string' ? input : JSON.stringify(input ?? {})
  ).digest('hex');
}

export class ActionLedger {
  constructor(private runId: string) {}

  propose(opts: {
    cycleNumber: number;
    role: string;
    teamId?: string;
    actionClass: ActionClass;
    targetKind: 'tool' | 'file' | 'git' | 'api' | 'output';
    targetRef: string;
    riskTier: RiskTier;
    summary: string;
    input?: unknown;
    reversible?: boolean;
    compensationAction?: unknown;
    policySnapshot?: unknown;
  }) {
    const id = `actl_${nanoid(10)}`;
    const db = getDb();
    db.prepare(`
      INSERT INTO action_ledger
      (id, run_id, cycle_number, role, team_id, action_class, target_kind, target_ref, risk_tier, status,
       summary, input_json, input_hash, reversible, compensation_action_json, policy_snapshot_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      this.runId,
      opts.cycleNumber,
      opts.role,
      opts.teamId ?? null,
      opts.actionClass,
      opts.targetKind,
      opts.targetRef,
      opts.riskTier,
      opts.summary,
      JSON.stringify(opts.input ?? {}),
      sha(opts.input ?? {}),
      opts.reversible ? 1 : 0,
      JSON.stringify(opts.compensationAction ?? {}),
      JSON.stringify(opts.policySnapshot ?? {}),
    );
    db.close();
    return id;
  }

  markPendingApproval(actionId: string, approvalId: string) {
    const db = getDb();
    db.prepare(`
      UPDATE action_ledger
      SET status = 'pending_approval', approval_id = ?
      WHERE id = ?
    `).run(approvalId, actionId);
    db.close();
  }

  markApproved(actionId: string, approvalId?: string) {
    const db = getDb();
    db.prepare(`
      UPDATE action_ledger
      SET status = 'approved', approval_id = COALESCE(?, approval_id)
      WHERE id = ?
    `).run(approvalId ?? null, actionId);
    db.close();
  }

  apply(actionId: string, opts?: {
    output?: unknown;
    artifactPath?: string;
  }) {
    const db = getDb();
    db.prepare(`
      UPDATE action_ledger
      SET status = 'applied',
          output_json = ?,
          output_hash = ?,
          artifact_path = COALESCE(?, artifact_path),
          applied_at = datetime('now')
      WHERE id = ?
    `).run(
      JSON.stringify(opts?.output ?? {}),
      sha(opts?.output ?? {}),
      opts?.artifactPath ?? null,
      actionId
    );
    db.close();
  }

  deny(actionId: string, reason: string) {
    const db = getDb();
    db.prepare(`
      UPDATE action_ledger
      SET status = 'denied', output_json = ?
      WHERE id = ?
    `).run(JSON.stringify({ reason }), actionId);
    db.close();
  }

  fail(actionId: string, error: string) {
    const db = getDb();
    db.prepare(`
      UPDATE action_ledger
      SET status = 'failed', output_json = ?
      WHERE id = ?
    `).run(JSON.stringify({ error }), actionId);
    db.close();
  }

  revert(actionId: string, result?: unknown) {
    const db = getDb();
    db.prepare(`
      UPDATE action_ledger
      SET status = 'reverted', output_json = ?, reverted_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(result ?? {}), actionId);
    db.close();
  }
}
5. Signed manifests + immutable artifacts