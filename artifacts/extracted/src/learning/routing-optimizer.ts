TypeScript

import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';
import { ProposalManager } from '@/learning/proposal-manager.js';
import { VersionManager } from '@/learning/version-manager.js';
import { ROUTING_OPTIMIZER_SYSTEM_PROMPT, RoutingOptimizerSchema } from '@/prompts/routing-optimizer.js';

export class RoutingOptimizer {
  private artifacts = new ImmutableArtifacts();
  private proposals = new ProposalManager();
  private versions = new VersionManager();

  async optimize(learningCycleId: string) {
    const db = getDb();
    const boards = db.prepare(`
      SELECT leaderboard_type, subject_key, average_score, average_policy_compliance, average_cost_usd, average_latency_ms, pass_rate
      FROM leaderboards
      ORDER BY updated_at DESC
      LIMIT 100
    `).all();
    db.close();

    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const out = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: ROUTING_OPTIMIZER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({ leaderboards: boards }, null, 2),
        },
      ],
      schema: RoutingOptimizerSchema,
    });

    const written = await this.artifacts.writeJson({
      runId: learningCycleId,
      relPath: `artifacts/learning/routing/routing_${Date.now()}.json`,
      data: out.config_json,
      artifactKind: 'routing_candidate',
    });

    const proposal = this.proposals.create({
      learningCycleId,
      proposalType: 'routing',
      targetKey: 'global',
      rationale: {
        summary: out.summary,
        expected_improvements: out.expected_improvements,
        regression_risks: out.regression_risks,
      },
      candidateArtifactPath: written.artifactPath,
    });

    const version = this.versions.createRoutingCandidate({
      configJson: out.config_json,
      proposalId: proposal.proposalId,
    });

    return {
      proposalId: proposal.proposalId,
      versionId: version.versionId,
      artifactPath: written.artifactPath,
    };
  }
}
13. Adapter distiller
This phase does not require you to actually train models yet. It requires you to export strong supervised datasets from traces so that fine-tuning or distillation becomes possible later.
