/**
 * Approval decision handlers (OWASP A01/A04).
 *
 * Extracted from `server.ts` so the logic — in particular the 404-on-unknown-ID
 * contract — is unit-testable without importing the server module (which
 * runs `checkBootSafety()` and `Bun.serve` at module scope).
 *
 * Approving also runs the enforcer's materialization pass: the approval is
 * the moment staged candidates become landable.
 */

import { ApprovalGate } from '@/runtime/approval-gate.js';
import { ApprovalEnforcer } from '@/runtime/approval-enforcer.js';

export interface ApprovalDecisionResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleApprovalDecision(opts: {
  id: string;
  action: 'approve' | 'reject';
  decidedBy?: string;
}): Promise<ApprovalDecisionResult> {
  const gate = new ApprovalGate();
  const approval = gate.findById(opts.id);
  const decidedBy = opts.decidedBy ?? 'human_api';

  // Unknown ID → 404. The old handler returned `{ok:true}` for any string.
  const decided = approval
    ? (opts.action === 'approve'
        ? gate.approve(opts.id, decidedBy)
        : gate.reject(opts.id, decidedBy))
    : false;

  if (!decided) {
    return { status: 404, body: { error: 'Approval not found', id: opts.id } };
  }

  if (opts.action === 'approve') {
    const enforcer = new ApprovalEnforcer(String(approval!.run_id));
    await enforcer.materializeApprovedActions();
  }

  return {
    status: 200,
    body: {
      ok: true,
      id: opts.id,
      status: opts.action === 'approve' ? 'approved' : 'rejected',
    },
  };
}
