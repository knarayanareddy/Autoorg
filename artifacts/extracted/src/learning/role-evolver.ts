TypeScript

import { getAdapter } from '@/adapters/adapter-factory.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';
import { VersionManager } from '@/learning/version-manager.js';
import { ProposalManager } from '@/learning/proposal-manager.js';
import { ROLE_EVOLVER_SYSTEM_PROMPT, RoleEvolverSchema } from '@/prompts/role-evolver.js';

export class RoleEvolver {
  private artifacts = new ImmutableArtifacts();
  private versions = new VersionManager();
  private proposals = new ProposalManager();

  async evolve(opts: {
    learningCycleId: string;
    roleKey: string;
    currentManifest: Record<string, unknown>;
    patternReport: Record<string, unknown>;
  }) {
    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const out = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: ROLE_EVOLVER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            roleKey: opts.roleKey,
            currentManifest: opts.currentManifest,
            patternReport: opts.patternReport,
          }, null, 2),
        },
      ],
      schema: RoleEvolverSchema,
    });

    const written = await this.artifacts.writeJson({
      runId: opts.learningCycleId,
      relPath: `artifacts/learning/proposals/role_${opts.roleKey}.json`,
      data: out.manifest_json,
      artifactKind: 'learning_role_candidate',
    });

    const proposal = this.proposals.create({
      learningCycleId: opts.learningCycleId,
      proposalType: 'role',
      targetKey: opts.roleKey,
      rationale: {
        change_summary: out.change_summary,
        expected_improvements: out.expected_improvements,
        regression_risks: out.regression_risks,
      },
      candidateArtifactPath: written.artifactPath,
    });

    const version = this.versions.createRoleCandidate({
      roleKey: opts.roleKey,
      manifestJson: out.manifest_json,
      proposalId: proposal.proposalId,
    });

    return {
      proposalId: proposal.proposalId,
      versionId: version.versionId,
      artifactPath: written.artifactPath,
    };
  }
}
11. Memory utility prompt