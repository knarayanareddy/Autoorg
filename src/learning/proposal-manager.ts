import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export interface ProposalOpts {
  learningCycleId: string;
  proposalType: 'prompt' | 'policy' | 'role' | 'routing';
  targetKey: string;
  rationale: any;
  candidateArtifactPath?: string;
}

export class ProposalManager {
  async create(opts: ProposalOpts) {
    const db = getDb();
    const id = `ip_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO improvement_proposals (id, learning_cycle_id, proposal_type, target_key, status, rationale_json, candidate_artifact_path)
      VALUES (?, ?, ?, ?, 'draft', ?, ?)
    `).run(
      id, 
      opts.learningCycleId, 
      opts.proposalType, 
      opts.targetKey, 
      JSON.stringify(opts.rationale), 
      opts.candidateArtifactPath ?? null
    );

    db.close();
    return { proposalId: id };
  }

  async updateStatus(proposalId: string, status: string, simId?: string) {
    const db = getDb();
    db.prepare(`
      UPDATE improvement_proposals 
      SET status = ?, simulation_run_id = ?
      WHERE id = ?
    `).run(status, simId ?? null, proposalId);
    db.close();
  }

  async setApproval(proposalId: string, approvalId: string) {
    const db = getDb();
    db.prepare(`
      UPDATE improvement_proposals 
      SET approval_id = ?, status = 'pending_approval'
      WHERE id = ?
    `).run(approvalId, proposalId);
    db.close();
  }
}
