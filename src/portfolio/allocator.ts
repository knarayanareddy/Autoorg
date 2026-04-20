import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { PORTFOLIO_ALLOCATOR_SYSTEM_PROMPT, PortfolioAllocationSchema } from '@/prompts/portfolio-allocator.js';

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
    `).all(this.portfolioRunId) as Array<any>;
    db.close();

    const alive = variants.filter(v => !['failed', 'quarantined', 'eliminated'].includes(v.status));

    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const suggestions = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: PORTFOLIO_ALLOCATOR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            portfolioRunId: this.portfolioRunId,
            roundId: opts.roundId,
            remainingBudgetUsd: opts.remainingBudgetUsd,
            variants: alive.map(v => ({
              id: v.id,
              key: v.variant_key,
              status: v.status,
              priorScore: v.prior_score,
              allocated: v.allocated_budget_usd,
              spent: v.spent_budget_usd,
              latestScore: v.latest_score,
              latestPass: v.latest_policy_compliance,
            })),
          }, null, 2),
        },
      ],
      schema: PortfolioAllocationSchema,
    });

    const db2 = getDb();
    for (const alloc of suggestions.allocations) {
      db2.prepare(`
        INSERT INTO portfolio_allocations
        (id, portfolio_run_id, portfolio_round_id, variant_id, allocation_type, amount_usd, rationale_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        `pa_${nanoid(10)}`,
        this.portfolioRunId,
        opts.roundId,
        alloc.variant_id,
        alloc.action,
        alloc.amount_usd,
        JSON.stringify({ rationale: alloc.rationale })
      );

      db2.prepare(`
        UPDATE portfolio_variants
        SET allocated_budget_usd = allocated_budget_usd + ?
        WHERE id = ?
      `).run(alloc.amount_usd, alloc.variant_id);

      if (alloc.action === 'eliminate') {
        db2.prepare(`
          UPDATE portfolio_variants
          SET status = 'eliminated'
          WHERE id = ?
        `).run(alloc.variant_id);
      }
    }
    db2.close();

    return suggestions;
  }
}
