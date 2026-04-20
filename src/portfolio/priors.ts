import { getDb } from '@/db/migrate.js';

export class PortfolioPriors {
  estimatePrior(variant: {
    variant_key: string;
    constitution_variant: string;
    template_variant: string;
  }) {
    const db = getDb();

    // Check if we have specific leaderboard data for this constitution
    const constRow = db.prepare(`
      SELECT average_score, pass_rate, average_cost_usd
      FROM leaderboards
      WHERE leaderboard_type = 'constitution' AND subject_key = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(variant.constitution_variant) as any;

    // Check if we have specific leaderboard data for this template
    const tmplRow = db.prepare(`
      SELECT average_score, pass_rate, average_cost_usd
      FROM leaderboards
      WHERE leaderboard_type = 'template' AND subject_key = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(variant.template_variant) as any;

    db.close();

    // Baseline if no data
    const score = ((constRow?.average_score ?? 0.65) + (tmplRow?.average_score ?? 0.65)) / 2;
    const passRate = ((constRow?.pass_rate ?? 0.50) + (tmplRow?.pass_rate ?? 0.50)) / 2;
    const cost = ((constRow?.average_cost_usd ?? 1.0) + (tmplRow?.average_cost_usd ?? 1.0)) / 2;

    return {
      prior_score: score,
      prior_pass_rate: passRate,
      prior_cost: cost,
    };
  }
}
