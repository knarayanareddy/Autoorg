import { getDb } from '@/db/migrate.js';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { z } from 'zod';
import { VersionManager } from './version-manager.js';
import { ProposalManager } from './proposal-manager.js';

const OptimizationSchema = z.object({
  revised_prompt: z.string(),
  change_log: z.string(),
  expected_score_delta: z.number()
});

export class PromptOptimizer {
  private versions = new VersionManager();
  private proposals = new ProposalManager();

  async optimize(opts: {
    learningCycleId: string;
    targetKey: string;
    patterns: any;
  }) {
    // 1. Get current prompt (from DB active or fall back to base file)
    const activeVersion = await this.versions.getActive(opts.targetKey);
    let currentContent: string;
    
    if (activeVersion) {
      currentContent = activeVersion.content;
    } else {
      // Logic to read from src/prompts/<key>.ts if no version exists
      // For simplicity in this demo, we'll assume there's a way to fetch it
      currentContent = "// Default base prompt for " + opts.targetKey;
    }

    const adapter = getAdapter({ provider: 'anthropic', model: 'claude-3-haiku' });
    
    const prompt = `
      You are the AutoOrg Prompt Optimizer. 
      Target: ${opts.targetKey}
      
      Current Prompt:
      ${currentContent}
      
      Mined Patterns:
      ${JSON.stringify(opts.patterns, null, 2)}
      
      Revise the prompt to incorporate these learnings while maintaining the role's core identity.
    `;

    const result = await adapter.structured({
      model: 'claude-3-haiku',
      messages: [{ role: 'system', content: prompt }],
      schema: OptimizationSchema
    });

    // 2. Create the proposal
    const proposal = await this.proposals.create({
      learningCycleId: opts.learningCycleId,
      proposalType: 'prompt',
      targetKey: opts.targetKey,
      rationale: { reasoning: result.change_log, expected_delta: result.expected_score_delta }
    });

    // 3. Create candidate version
    const versionId = await this.versions.createCandidate({
      targetKey: opts.targetKey,
      versionLabel: `opt-${opts.learningCycleId}`,
      content: result.revised_prompt,
      proposalId: proposal.proposalId,
      parentId: activeVersion?.id
    });

    return { proposalId: proposal.proposalId, versionId, revisedPrompt: result.revised_prompt };
  }
}
