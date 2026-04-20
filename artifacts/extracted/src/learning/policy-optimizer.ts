TypeScript

import { getAdapter } from '@/adapters/adapter-factory.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';
import { VersionManager } from '@/learning/version-manager.js';
import { ProposalManager } from '@/learning/proposal-manager.js';
import { POLICY_OPTIMIZER_SYSTEM_PROMPT, PolicyOptimizerSchema } from '@/prompts/policy-optimizer.js';

export class PolicyOptimizer {
  private artifacts = new ImmutableArtifacts();
  private versions = new VersionManager();
  private proposals = new ProposalManager();

  async optimize(opts: {
    learningCycleId: string;
    targetKey: string;
    currentConfig: Record<string, unknown>;
    patternReport: Record<string, unknown>;
  }) {
    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const out = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: POLICY_OPTIMIZER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            targetKey: opts.targetKey,
            currentConfig: opts.currentConfig,
            patternReport: opts.patternReport,
          }, null, 2),
        },
      ],
      schema: PolicyOptimizerSchema,
    });

    const written = await this.artifacts.writeJson({
      runId: opts.learningCycleId,
      relPath: `artifacts/learning/proposals/${opts.targetKey.replace(/[:/]/g, '_')}.policy.json`,
      data: out.config_json,
      artifactKind: 'learning_policy_candidate',
    });

    const proposal = this.proposals.create({
      learningCycleId: opts.learningCycleId,
      proposalType: 'policy',
      targetKey: opts.targetKey,
      rationale: {
        change_summary: out.change_summary,
        expected_improvements: out.expected_improvements,
        regression_risks: out.regression_risks,
      },
      candidateArtifactPath: written.artifactPath,
    });

    const version = this.versions.createPolicyCandidate({
      targetKey: opts.targetKey,
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
10. Role evolver prompt + runtime