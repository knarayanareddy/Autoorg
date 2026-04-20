TypeScript

import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { ApprovalGate } from '@/runtime/approval-gate.js';
import { ProposalManager } from '@/learning/proposal-manager.js';
import { VersionManager } from '@/learning/version-manager.js';
import { ROLLOUT_SIMULATOR_SYSTEM_PROMPT, RolloutSimulationSchema } from '@/prompts/rollout-simulator.js';

export class ReleaseGate {
  private approvals = new ApprovalGate();
  private proposals = new ProposalManager();
  private versions = new VersionManager();

  async evaluate(opts: {
    proposalId: string;
    versionKind: 'prompt' | 'policy' | 'role' | 'routing';
    versionId: string;
    simulationDelta: Record<string, number>;
    driftReport?: {
      drift_score: number;
      regression_risk: number;
      blocked: boolean;
      summary: string;
    };
    runId: string;
    cycleNumber: number;
  }) {
    const benchmarkPass =
      (opts.simulationDelta.score ?? 0) >= -0.01 &&
      (opts.simulationDelta.groundedness ?? 0) >= -0.02 &&
      (opts.simulationDelta.policy ?? 0) >= -0.02;

    const driftPass = !opts.driftReport?.blocked && (opts.driftReport?.regression_risk ?? 0) < 0.60;

    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const report = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: ROLLOUT_SIMULATOR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            proposalId: opts.proposalId,
            versionKind: opts.versionKind,
            simulationDelta: opts.simulationDelta,
            driftReport: opts.driftReport ?? null,
            benchmarkPass,
            driftPass,
          }, null, 2),
        },
      ],
      schema: RolloutSimulationSchema,
    });

    const db = getDb();

    if (!report.recommended || !benchmarkPass || !driftPass) {
      db.prepare(`
        INSERT INTO rollout_decisions
        (id, proposal_id, version_kind, version_ref, decision, benchmark_pass, drift_pass, approval_pass, summary_json)
        VALUES (?, ?, ?, ?, 'blocked', ?, ?, 0, ?)
      `).run(
        `rod_${nanoid(10)}`,
        opts.proposalId,
        opts.versionKind,
        opts.versionId,
        benchmarkPass ? 1 : 0,
        driftPass ? 1 : 0,
        JSON.stringify(report),
      );
      db.close();
      return {
        released: false,
        blocked: true,
        report,
      };
    }

    const approvalId = this.approvals.request({
      runId: opts.runId,
      cycleNumber: opts.cycleNumber,
      approvalType: 'self_improvement_release',
      subject: opts.proposalId,
      requestedBy: 'LearningOrchestrator',
      summary: `Release candidate ${opts.versionKind}/${opts.versionId}`,
      details: {
        proposalId: opts.proposalId,
        versionKind: opts.versionKind,
        versionId: opts.versionId,
        simulationDelta: opts.simulationDelta,
        driftReport: opts.driftReport,
        releaseReport: report,
      },
    });

    db.prepare(`
      INSERT INTO rollout_decisions
      (id, proposal_id, version_kind, version_ref, decision, benchmark_pass, drift_pass, approval_pass, summary_json)
      VALUES (?, ?, ?, ?, 'approved', ?, ?, 0, ?)
    `).run(
      `rod_${nanoid(10)}`,
      opts.proposalId,
      opts.versionKind,
      opts.versionId,
      benchmarkPass ? 1 : 0,
      driftPass ? 1 : 0,
      JSON.stringify({ approvalId, report }),
    );
    db.close();

    return {
      released: false,
      pendingApproval: true,
      approvalId,
      report,
    };
  }

  activate(opts: {
    proposalId: string;
    versionKind: 'prompt' | 'policy' | 'role' | 'routing';
    versionId: string;
    artifactPath?: string;
  }) {
    if (opts.versionKind === 'prompt') this.versions.activatePrompt(opts.versionId);
    if (opts.versionKind === 'policy') this.versions.activatePolicy(opts.versionId);
    if (opts.versionKind === 'role') this.versions.activateRole(opts.versionId);
    if (opts.versionKind === 'routing') this.versions.activateRouting(opts.versionId);

    this.proposals.markReleased(opts.proposalId, opts.artifactPath);

    const db = getDb();
    db.prepare(`
      UPDATE rollout_decisions
      SET approval_pass = 1
      WHERE proposal_id = ? AND version_ref = ?
    `).run(opts.proposalId, opts.versionId);
    db.close();

    return { activated: true };
  }
}
18. Learning orchestrator