TypeScript

import { nanoid } from 'nanoid';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';
import { VersionManager } from '@/learning/version-manager.js';
import { ProposalManager } from '@/learning/proposal-manager.js';
import { PROMPT_OPTIMIZER_SYSTEM_PROMPT, PromptOptimizerSchema } from '@/prompts/prompt-optimizer.js';

export class PromptOptimizer {
  private artifacts = new ImmutableArtifacts();
  private versions = new VersionManager();
  private proposals = new ProposalManager();

  async optimize(opts: {
    learningCycleId: string;
    targetKey: string;          // e.g. role:CEO
    basePromptPath?: string;    // e.g. roles/CEO.md
    patternReport: Record<string, unknown>;
  }) {
    const currentPrompt = opts.basePromptPath
      ? await readFile(path.join(process.cwd(), opts.basePromptPath), 'utf-8').catch(() => '')
      : (this.versions.getActivePrompt(opts.targetKey)?.content ?? '');

    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const out = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: PROMPT_OPTIMIZER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            targetKey: opts.targetKey,
            currentPrompt,
            patternReport: opts.patternReport,
          }, null, 2),
        },
      ],
      schema: PromptOptimizerSchema,
    });

    const written = await this.artifacts.writeText({
      runId: opts.learningCycleId,
      relPath: `artifacts/learning/proposals/${opts.targetKey.replace(/[:/]/g, '_')}.prompt.md`,
      text: out.revised_prompt,
      artifactKind: 'learning_prompt_candidate',
      mimeType: 'text/markdown',
    });

    const proposal = this.proposals.create({
      learningCycleId: opts.learningCycleId,
      proposalType: 'prompt',
      targetKey: opts.targetKey,
      rationale: {
        change_summary: out.change_summary,
        expected_improvements: out.expected_improvements,
        regression_risks: out.regression_risks,
      },
      candidateArtifactPath: written.artifactPath,
    });

    const version = this.versions.createPromptCandidate({
      targetKey: opts.targetKey,
      content: out.revised_prompt,
      proposalId: proposal.proposalId,
      notes: {
        change_summary: out.change_summary,
      },
    });

    return {
      proposalId: proposal.proposalId,
      versionId: version.versionId,
      artifactPath: written.artifactPath,
      revisedPrompt: out.revised_prompt,
    };
  }
}
9. Policy optimizer prompt + runtime