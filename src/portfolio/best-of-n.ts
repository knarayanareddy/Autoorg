import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { BEST_OF_N_SYNTHESIZER_SYSTEM_PROMPT, BestOfNSynthesisSchema } from '@/prompts/best-of-n-synthesizer.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';
import path from 'node:path';

export class BestOfNSynthesizer {
  private artifacts = new ImmutableArtifacts();

  constructor(private portfolioRunId: string) {}

  async synthesize(opts: {
    roundId: string;
    survivors: Array<{ id: string; key: string; text: string }>;
  }) {
    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-opus-4',
    });

    const result = await adapter.structured({
      model: 'claude-opus-4',
      messages: [
        { role: 'system', content: BEST_OF_N_SYNTHESIZER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            survivors: opts.survivors,
          }, null, 2),
        },
      ],
      schema: BestOfNSynthesisSchema,
    });

    const synthesisPath = `./artifacts/portfolio/runs/${this.portfolioRunId}/final_synthesis.md`;
    await this.artifacts.writeText({
      runId: this.portfolioRunId,
      relPath: synthesisPath,
      text: result.synthesized_output,
      artifactKind: 'portfolio_synthesis',
    });

    const db = getDb();
    const synthesisId = `syn_${nanoid(10)}`;
    db.prepare(`
      INSERT INTO portfolio_syntheses
      (id, portfolio_run_id, portfolio_round_id, synthesis_type, source_variant_ids_json, artifact_path, summary_json)
      VALUES (?, ?, ?, 'best_of_n', ?, ?, ?)
    `).run(
      synthesisId,
      this.portfolioRunId,
      opts.roundId,
      JSON.stringify(opts.survivors.map(s => s.id)),
      synthesisPath,
      JSON.stringify({ summary: result.summary, breakthroughs: result.top_breakthroughs })
    );

    db.prepare(`
      UPDATE portfolio_runs
      SET final_artifact_path = ?, status = 'completed', finished_at = datetime('now')
      WHERE id = ?
    `).run(synthesisPath, this.portfolioRunId);
    db.close();

    return { synthesisId, synthesisPath };
  }
}
