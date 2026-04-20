import { getDb } from '@/db/migrate.js';

export interface RunObjectiveWeights {
  quality: number;
  cost: number;
  speed: number;
}

export class ObjectiveOptimizer {
  constructor(private runId: string) {}

  async getLatestObjectives(): Promise<RunObjectiveWeights> {
    const db = getDb();
    const row = db.prepare(`
      SELECT quality_weight, cost_weight, speed_weight 
      FROM multi_objectives 
      WHERE run_id = ? 
      ORDER BY updated_at DESC 
      LIMIT 1
    `).get(this.runId) as any;
    db.close();

    if (!row) return { quality: 1.0, cost: 1.0, speed: 1.0 };
    return {
      quality: row.quality_weight,
      cost: row.cost_weight,
      speed: row.speed_weight,
    };
  }

  calculateModelMap(weights: RunObjectiveWeights): Record<string, string> {
    // Decision logic based on Pareto weights
    // High Cost Weight => move toward Haiku/mini models
    // High Quality Weight => move toward Opus/GPT-4o models

    const map: Record<string, string> = {
      ceo: weights.quality > 1.2 ? 'claude-opus-4' : 'claude-sonnet-4-5',
      engineer: weights.cost > 1.5 ? 'claude-haiku-3-5' : 'claude-sonnet-4-5',
      critic: weights.speed > 1.5 ? 'gpt-4o-mini' : 'claude-sonnet-4-5',
      archivist: weights.cost > 1.2 ? 'gpt-4o-mini' : 'claude-sonnet-4-5',
    };

    return map;
  }

  async setObjectives(weights: RunObjectiveWeights) {
    const db = getDb();
    db.prepare(`
      INSERT INTO multi_objectives (id, run_id, quality_weight, cost_weight, speed_weight)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      `obj_${Math.random().toString(36).slice(2, 10)}`,
      this.runId,
      weights.quality,
      weights.cost,
      weights.speed
    );
    db.close();
  }
}
