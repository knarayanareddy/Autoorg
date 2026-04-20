TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { ApprovalGate } from '@/runtime/approval-gate.js';
import { ActionLedger } from '@/runtime/action-ledger.js';

export class ProposalManager {
  private approvals = new ApprovalGate();

  create(opts: {
    learningCycleId: string;
    proposalType: 'prompt' | 'policy' | 'role' | 'routing' | 'memory_prune' | 'template' | 'adapter_distill';
    targetKey: string;
    rationale: Record<string, unknown>;
    candidateArtifactPath?: string;
    expectedDelta?: Record<string, unknown>;
  }) {
    const db = getDb();
    const id = `ip_${nanoid(10)}`;
    db.prepare(`
      INSERT INTO improvement_proposals
      (id, learning_cycle_id, proposal_type, target_key, status, rationale_json, candidate_artifact_path, expected_delta_json)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)
    `).run(
      id,
      opts.learningCycleId,
      opts.proposalType,
      opts.targetKey,
      JSON.stringify(opts.rationale),
      opts.candidateArtifactPath ?? null,
      JSON.stringify(opts.expectedDelta ?? {})
    );
    db.close();
    return { proposalId: id };
  }

  attachSimulation(proposalId: string, simulationRunId: string) {
    const db = getDb();
    db.prepare(`
      UPDATE improvement_proposals
      SET simulation_run_id = ?, status = 'simulating'
      WHERE id = ?
    `).run(simulationRunId, proposalId);
    db.close();
  }

  requestReleaseApproval(opts: {
    proposalId: string;
    runId: string;
    cycleNumber: number;
    summary: string;
    details: Record<string, unknown>;
  }) {
    const approvalId = this.approvals.request({
      runId: opts.runId,
      cycleNumber: opts.cycleNumber,
      approvalType: 'self_improvement',
      subject: opts.proposalId,
      requestedBy: 'LearningOrchestrator',
      summary: opts.summary,
      details: opts.details,
    });

    const db = getDb();
    db.prepare(`
      UPDATE improvement_proposals
      SET status = 'pending_approval', approval_id = ?
      WHERE id = ?
    `).run(approvalId, opts.proposalId);
    db.close();

    return { approvalId };
  }

  markReleased(proposalId: string, artifactPath?: string) {
    const db = getDb();
    db.prepare(`
      UPDATE improvement_proposals
      SET status = 'released', release_artifact_path = ?, released_at = datetime('now')
      WHERE id = ?
    `).run(artifactPath ?? null, proposalId);
    db.close();
  }

  reject(proposalId: string) {
    const db = getDb();
    db.prepare(`
      UPDATE improvement_proposals
      SET status = 'rejected'
      WHERE id = ?
    `).run(proposalId);
    db.close();
  }
}
8. Prompt optimizer prompt