import { getDb } from '@/db/migrate.js';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { z } from 'zod';
import { nanoid } from 'nanoid';

const PatternReportSchema = z.object({
  winning_patterns: z.array(z.string()),
  failure_patterns: z.array(z.string()),
  recommended_optimizations: z.array(z.object({
    target: z.string(), // e.g. 'role:CEO'
    reasoning: z.string(),
    suggestion: z.string()
  }))
});

export class PatternMiner {
  async mine(opts: { learningCycleId: string }) {
    const db = getDb();
    
    // Gather recent benchmark data
    const benchmarks = db.prepare(`
      SELECT suite_name, score, groundedness, latency_ms 
      FROM benchmark_metrics 
      ORDER BY created_at DESC LIMIT 20
    `).all();

    // Gather recent run results from results.tsv logic (simplified by looking at db)
    const recentRuns = db.prepare(`
      SELECT id, mission_text, total_cost, total_steps, status 
      FROM runs 
      ORDER BY created_at DESC LIMIT 10
    `).all();

    db.close();

    const adapter = getAdapter({ provider: 'anthropic', model: 'claude-3-haiku' });
    
    const prompt = `
      You are the AutoOrg Pattern Miner. 
      Analyze the following historical data and identify repeatable patterns for success and failure.
      
      Historical Benchmarks:
      ${JSON.stringify(benchmarks, null, 2)}
      
      Recent Run History:
      ${JSON.stringify(recentRuns, null, 2)}
      
      Identify specific roles or prompts that consistently overperform or underperform.
    `;

    const report = await adapter.structured({
      model: 'claude-3-haiku',
      messages: [{ role: 'system', content: prompt }],
      schema: PatternReportSchema
    });

    const db2 = getDb();
    const reportId = `ptr_${nanoid(10)}`;
    db2.prepare(`
      INSERT INTO pattern_reports (id, learning_cycle_id, report_json)
      VALUES (?, ?, ?)
    `).run(reportId, opts.learningCycleId, JSON.stringify(report));
    db2.close();

    return { reportId, report };
  }
}
