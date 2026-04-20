TypeScript

import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { JUDGE_COUNCIL_SYSTEM_PROMPT, JudgeCouncilVoteSchema } from '@/prompts/judge-council.js';

export class JudgeCouncil {
  constructor(private portfolioRunId: string) {}

  async voteOnVariants(opts: {
    roundId?: string;
    variants: Array<{
      variantId: string;
      displayName: string;
      outputText: string;
      metrics: Record<string, unknown>;
    }>;
    judges?: Array<{ judgeName: string; model: string }>;
  }) {
    const judges = opts.judges ?? [
      { judgeName: 'RatchetJudge-A', model: 'claude-opus-4' },
      { judgeName: 'RatchetJudge-B', model: 'claude-sonnet-4-5' },
      { judgeName: 'RatchetJudge-C', model: 'gpt-4.1' },
    ];

    const votes = [];

    for (const judge of judges) {
      const adapter = getAdapter({
        provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
        model: judge.model,
      });

      const vote = await adapter.structured({
        model: judge.model,
        messages: [
          { role: 'system', content: JUDGE_COUNCIL_SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              variants: opts.variants.map(v => ({
                variantId: v.variantId,
                displayName: v.displayName,
                metrics: v.metrics,
                outputText: v.outputText.slice(0, 14000),
              })),
            }, null, 2),
          },
        ],
        schema: JudgeCouncilVoteSchema,
      });

      votes.push({
        judgeName: judge.judgeName,
        judgeModel: judge.model,
        ...vote,
      });
    }

    const tally = new Map<string, number>();
    for (const v of votes) {
      tally.set(v.voted_variant_id, (tally.get(v.voted_variant_id) ?? 0) + v.score);
    }

    const winner = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? opts.variants[0]?.variantId;

    const db = getDb();
    for (const vote of votes) {
      db.prepare(`
        INSERT INTO judge_council_votes
        (id, portfolio_run_id, portfolio_round_id, subject_kind, subject_ref, judge_name, judge_model, voted_variant_id, score, reasoning_json)
        VALUES (?, ?, ?, 'variant_output', ?, ?, ?, ?, ?, ?)
      `).run(
        `jcv_${nanoid(10)}`,
        this.portfolioRunId,
        opts.roundId ?? null,
        'portfolio_round',
        vote.judgeName,
        vote.judgeModel,
        vote.voted_variant_id,
        vote.score,
        JSON.stringify({
          rationale: vote.rationale,
          concerns: vote.concerns,
        })
      );
    }
    db.close();

    return { winnerVariantId: winner, votes };
  }
}
10. Quarantine reviewer prompt