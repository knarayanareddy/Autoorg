TypeScript

import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { PORTFOLIO_ALLOCATOR_SYSTEM_PROMPT, PortfolioAllocationSchema } from '@/prompts/portfolio-allocator.js';

function utility(v: {
  latest_score?: number | null;
  latest_groundedness?: number | null;
  latest_policy_compliance?: number | null;
  spent_budget_usd: number;
  prior_score: number;
  status: string;
}) {
  if (v.status === 'quarantined' || v.status === 'failed' || v.status === 'eliminated') return -999;
  const score = v.latest_score ?? v.prior_score ?? 0.5;
  const groundedness = v.latest_groundedness ?? score;
  const policy = v.latest_policy_compliance ?? 1;
  const spent = Math.max(0.01, v.spent_budget_usd || 0.01);
  return (0.45 * score + 0.20 * groundedness + 0.20 * policy) / (0.25 + spent);
}

export class PortfolioAllocator {
  constructor(private portfolioRunId: string) {}

  async rebalance(opts: {
    roundId: string;
    remainingBudgetUsd: number;
  }) {
    const db = getDb();
    const variants = db.prepare(`
      SELECT *
      FROM portfolio_variants
      WHERE portfolio_run_id = ?
      ORDER BY created_at ASC
    `).all(this.portfolioRunId) as Array<any>;
    db.close();

    const ranked = [...variants].sort((a, b) => utility(b) - utility(a));
    const alive = ranked.filter(v => !['failed', 'quarantined', 'eliminated'].includes(v.status));

    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const deterministicSuggestion = alive.map((v, idx) => ({
      variant_id: v.id,
      amount_usd: Number(
        (
          opts.remainingBudgetUsd *
          ((alive.length - idx) / alive.reduce((acc, _, i) => acc + (alive.length - i), 0))
        ).toFixed(4)
      ),
      action: idx === 0 ? 'bonus' : idx >= Math.max(2, alive.length - 1) ? 'cut' : 'rebalance',
      scoreHint: utility(v),
    }));

    const llm = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: PORTFOLIO_ALLOCATOR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            portfolioRunId: this.portfolioRunId,
            remainingBudgetUsd: opts.remainingBudgetUsd,
            variants,
            deterministicSuggestion,
          }, null, 2),
        },
      ],
      schema: PortfolioAllocationSchema,
    });

    const db2 = getDb();

    for (const alloc of llm.allocations) {
      db2.prepare(`
        INSERT INTO portfolio_allocations
        (id, portfolio_run_id, portfolio_round_id, variant_id, allocation_type, amount_usd, rationale_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        `pal_${nanoid(10)}`,
        this.portfolioRunId,
        opts.roundId,
        alloc.variant_id,
        alloc.action,
        alloc.amount_usd,
        JSON.stringify({ rationale: alloc.rationale })
      );

      db2.prepare(`
        UPDATE portfolio_variants
        SET allocated_budget_usd = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(alloc.amount_usd, alloc.variant_id);

      if (alloc.action === 'eliminate') {
        db2.prepare(`
          UPDATE portfolio_variants
          SET status = 'eliminated', updated_at = datetime('now')
          WHERE id = ?
        `).run(alloc.variant_id);
      }
    }

    db2.close();

    return llm;
  }
}
8. Judge council prompt