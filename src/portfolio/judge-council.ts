import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { JUDGE_COUNCIL_SYSTEM_PROMPT, JudgeCouncilVoteSchema } from '@/prompts/judge-council.js';

export class JudgeCouncil {
  constructor(private portfolioRunId: string) {}

  async vote(opts: {
    roundId: string;
    variantOutputs: Array<{ id: string; key: string; text: string }>;
  }) {
    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-opus-4', // Council uses the strongest model
    });

    const result = await adapter.structured({
      model: 'claude-opus-4',
      messages: [
        { role: 'system', content: JUDGE_COUNCIL_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            outputs: opts.variantOutputs,
          }, null, 2),
        },
      ],
      schema: JudgeCouncilVoteSchema,
    });

    const db = getDb();
    db.prepare(`
      INSERT INTO judge_council_votes
      (id, portfolio_run_id, portfolio_round_id, subject_kind, subject_ref, judge_name, judge_model, voted_variant_id, score, reasoning_json)
      VALUES (?, ?, ?, 'variant_output', ?, 'Council_Lead', ?, ?, ?, ?)
    `).run(
      `jcv_${nanoid(10)}`,
      this.portfolioRunId,
      opts.roundId,
      opts.roundId,
      'claude-opus-4',
      result.winner_id,
      result.scores[result.winner_id] ?? 0,
      JSON.stringify(result)
    );
    db.close();

    return result;
  }
}
