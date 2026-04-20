TypeScript

import { getDb } from '@/db/migrate.js';

export class PortfolioPriors {
  estimatePrior(variant: {
    variant_key: string;
    constitution_variant: string;
    template_variant: string;
    model_map: Record<string, string>;
  }) {
    const db = getDb();

    const constRow = db.prepare(`
      SELECT average_score, average_policy_compliance, average_cost_usd
      FROM leaderboards
      WHERE leaderboard_type = 'constitution' AND subject_key = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(variant.constitution_variant) as
      | { average_score: number; average_policy_compliance: number; average_cost_usd: number }
      | undefined;

    const tmplRow = db.prepare(`
      SELECT average_score, average_policy_compliance, average_cost_usd
      FROM leaderboards
      WHERE leaderboard_type = 'template' AND subject_key = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(variant.template_variant) as
      | { average_score: number; average_policy_compliance: number; average_cost_usd: number }
      | undefined;

    db.close();

    const score = ((constRow?.average_score ?? 0.65) + (tmplRow?.average_score ?? 0.65)) / 2;
    const policy = ((constRow?.average_policy_compliance ?? 0.95) + (tmplRow?.average_policy_compliance ?? 0.95)) / 2;
    const cost = ((constRow?.average_cost_usd ?? 1.0) + (tmplRow?.average_cost_usd ?? 1.0)) / 2;

    return {
      prior_score: score,
      prior_policy: policy,
      prior_cost: cost,
    };
  }
}
6. Portfolio allocator prompt