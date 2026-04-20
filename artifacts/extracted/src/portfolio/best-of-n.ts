TypeScript

import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';
import { BEST_OF_N_SYNTHESIZER_SYSTEM_PROMPT } from '@/prompts/best-of-n-synthesizer.js';

export class BestOfN {
  private artifacts = new ImmutableArtifacts();

  constructor(private portfolioRunId: string) {}

  async synthesize(opts: {
    roundId?: string;
    variants: Array<{
      variantId: string;
      displayName: string;
      outputText: string;
      metrics: Record<string, unknown>;
    }>;
    councilSummary?: unknown;
  }) {
    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-opus-4',
    });

    const response = await adapter.run({
      model: 'claude-opus-4',
      messages: [
        { role: 'system', content: BEST_OF_N_SYNTHESIZER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            variants: opts.variants.map(v => ({
              variantId: v.variantId,
              displayName: v.displayName,
              metrics: v.metrics,
              outputText: v.outputText.slice(0, 12000),
            })),
            councilSummary: opts.councilSummary ?? null,
          }, null, 2),
        },
      ],
      temperature: 0.2,
      maxTokens: 2600,
    });

    const synthesisId = `psyn_${nanoid(10)}`;
    const written = await this.artifacts.writeText({
      runId: this.portfolioRunId,
      relPath: `artifacts/portfolio/syntheses/${synthesisId}.md`,
      text: response.content,
      artifactKind: 'portfolio_synthesis',
      mimeType: 'text/markdown',
    });

    const winnerGuess = opts.variants[0]?.variantId ?? null;

    const db = getDb();
    db.prepare(`
      INSERT INTO portfolio_syntheses
      (id, portfolio_run_id, portfolio_round_id, synthesis_type, winning_variant_id, source_variant_ids_json, artifact_path, summary_json)
      VALUES (?, ?, ?, 'best_of_n', ?, ?, ?, ?)
    `).run(
      synthesisId,
      this.portfolioRunId,
      opts.roundId ?? null,
      winnerGuess,
      JSON.stringify(opts.variants.map(v => v.variantId)),
      written.artifactPath,
      JSON.stringify({
        sourceCount: opts.variants.length,
        usedCouncilSummary: !!opts.councilSummary,
      })
    );
    db.close();

    return {
      synthesisId,
      artifactPath: written.artifactPath,
      content: response.content,
    };
  }
}
15. Tournament referee prompt