import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { REFLECTION_CRITIC_SYSTEM_PROMPT, ReflectionReportSchema } from '@/prompts/reflection-critic.js';

export class ReflectionService {
  constructor(private runId: string) {}

  async reflect(opts: {
    cycleNumber: number;
    transcript: string;
  }) {
    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const report = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: REFLECTION_CRITIC_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            runId: this.runId,
            cycle: opts.cycleNumber,
            transcriptSnippet: opts.transcript.slice(-15000), // Last ~15k chars for context
          }, null, 2),
        },
      ],
      schema: ReflectionReportSchema,
    });

    const db = getDb();
    const reportId = `ref_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO reflection_reports
      (id, run_id, cycle_number, critique_md, debt_score, bottlenecks_json, suggested_pivots_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      reportId,
      this.runId,
      opts.cycleNumber,
      report.critique,
      report.debt_score,
      JSON.stringify(report.bottlenecks),
      JSON.stringify(report.suggested_pivots)
    );
    db.close();

    return { reportId, report };
  }
}
