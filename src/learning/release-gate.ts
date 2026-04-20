import { getDb } from '@/db/migrate.js';
import { VersionManager } from './version-manager.js';
import { ProposalManager } from './proposal-manager.js';
import { ApprovalGate } from '@/runtime/approval-gate.js';

export class ReleaseGate {
  private versions = new VersionManager();
  private proposals = new ProposalManager();
  private approvals = new ApprovalGate();

  /**
   * Processes a simulation result and decides whether to release or request human approval.
   */
  async processSimulation(proposalId: string, simResult: { improved: boolean; delta: number }) {
    if (!simResult.improved) {
      // Automatic rejection if it regresses
      await this.proposals.updateStatus(proposalId, 'rejected');
      return { status: 'rejected', reason: 'Regression detected in simulation' };
    }

    // Since HITL is mandatory for cognitive changes (per plan), we request approval
    const db = getDb();
    const prop = db.prepare(`SELECT * FROM improvement_proposals WHERE id = ?`).get(proposalId) as any;
    db.close();

    const approvalId = this.approvals.request({
      runId: prop.learning_cycle_id,
      cycleNumber: 0,
      approvalType: 'self_improvement',
      subject: `Optimize ${prop.target_key}`,
      requestedBy: 'LearningOrchestrator',
      summary: `AI proposes optimization for ${prop.target_key}. Expected improvement: +${(simResult.delta * 100).toFixed(1)}%`,
      details: JSON.parse(prop.rationale_json)
    });

    await this.proposals.setApproval(proposalId, approvalId);

    return { status: 'pending_approval', approvalId };
  }

  /**
   * Final release step after human approval.
   */
  async release(proposalId: string) {
    const db = getDb();
    const prop = db.prepare(`SELECT * FROM improvement_proposals WHERE id = ?`).get(proposalId) as any;
    const version = db.prepare(`SELECT id FROM prompt_versions WHERE proposal_id = ?`).get(proposalId) as { id: string };
    db.close();

    if (!prop || !version) throw new Error('Proposal or version missing');

    await this.versions.activate(version.id);
    await this.proposals.updateStatus(proposalId, 'released');
    
    return { success: true, activatedVersion: version.id };
  }
}
