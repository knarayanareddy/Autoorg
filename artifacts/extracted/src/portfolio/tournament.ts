TypeScript

import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';
import { TOURNAMENT_REFEREE_SYSTEM_PROMPT, TournamentRefereeSchema } from '@/prompts/tournament-referee.js';

export class Tournament {
  private artifacts = new ImmutableArtifacts();

  constructor(private portfolioRunId: string) {}

  pairwise<T>(items: T[]) {
    const pairs: Array<[T, T]> = [];
    for (let i = 0; i < items.length - 1; i += 2) {
      pairs.push([items[i], items[i + 1]]);
    }
    return pairs;
  }

  async runRound(opts: {
    roundId?: string;
    variants: Array<{
      variantId: string;
      displayName: string;
      outputText: string;
      metrics: Record<string, unknown>;
    }>;
  }) {
    const pairs = this.pairwise(opts.variants);
    const winners: string[] = [];

    for (const [a, b] of pairs) {
      const adapter = getAdapter({
        provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
        model: 'claude-sonnet-4-5',
      });

      const verdict = await adapter.structured({
        model: 'claude-sonnet-4-5',
        messages: [
          { role: 'system', content: TOURNAMENT_REFEREE_SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              a: {
                variantId: a.variantId,
                displayName: a.displayName,
                metrics: a.metrics,
                outputText: a.outputText.slice(0, 10000),
              },
              b: {
                variantId: b.variantId,
                displayName: b.displayName,
                metrics: b.metrics,
                outputText: b.outputText.slice(0, 10000),
              },
            }, null, 2),
          },
        ],
        schema: TournamentRefereeSchema,
      });

      winners.push(verdict.winner_variant_id);

      const matchId = `tm_${nanoid(10)}`;
      const written = await this.artifacts.writeJson({
        runId: this.portfolioRunId,
        relPath: `artifacts/portfolio/councils/${matchId}.json`,
        data: verdict,
        artifactKind: 'tournament_match',
      });

      const db = getDb();
      db.prepare(`
        INSERT INTO tournament_matches
        (id, portfolio_run_id, portfolio_round_id, variant_a_id, variant_b_id, winner_variant_id, referee_report_json, artifact_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        matchId,
        this.portfolioRunId,
        opts.roundId ?? null,
        a.variantId,
        b.variantId,
        verdict.winner_variant_id,
        JSON.stringify(verdict),
        written.artifactPath,
      );
      db.close();
    }

    return winners;
  }
}
17. Portfolio runner
This is the main Phase 8 orchestration layer.
