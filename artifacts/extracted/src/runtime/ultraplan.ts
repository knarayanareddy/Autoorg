TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { parseStructuredOutputLenient } from '@/utils/structured-output.js';
import { z } from 'zod';
import { buildUltraPlanSystemPrompt, buildUltraPlanUserPrompt } from '@/prompts/ultraplan.js';
import type { ModelConfig, OrgConfig, LLMProvider } from '@/types/index.js';

const UltraPlanSchema = z.object({
  diagnosis: z.string(),
  abandoned_paths: z.array(z.string()),
  new_strategy: z.string(),
  five_cycle_plan: z.array(z.string()).min(1).max(5),
  risks: z.array(z.string()),
  approval_needed: z.boolean(),
  approval_reason: z.string().optional(),
});

export type UltraPlanResult = z.infer<typeof UltraPlanSchema>;

export class UltraPlanner {
  private runId: string;

  constructor(runId: string) {
    this.runId = runId;
  }

  async run(opts: {
    config: OrgConfig;
    cycleNumber: number;
    currentBest: number;
    plateauCount: number;
    mission: string;
    memorySummary: string;
    objectionsSummary: string;
    graphSummary: string;
    triggerReason: string;
  }): Promise<{ sessionId: string; result: UltraPlanResult; costUsd: number }> {
    const sessionId = `up_${nanoid(8)}`;

    const model: ModelConfig = opts.config.modelAssignments.RatchetJudge ?? {
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as LLMProvider,
      model: 'claude-opus-4',
    };

    const db = getDb();
    db.prepare(`
      INSERT INTO ultraplan_sessions
        (id, run_id, cycle_number, trigger_reason, planner_model, prompt, status, approval_required)
      VALUES (?, ?, ?, ?, ?, ?, 'running', 1)
    `).run(
      sessionId,
      this.runId,
      opts.cycleNumber,
      opts.triggerReason,
      model.model,
      '[ULTRAPLAN PROMPT REDACTED FOR DB SIZE]'
    );
    db.close();

    const adapter = getAdapter(model);

    const system = buildUltraPlanSystemPrompt();
    const user = buildUltraPlanUserPrompt({
      cycleNumber: opts.cycleNumber,
      currentBest: opts.currentBest,
      plateauCount: opts.plateauCount,
      mission: opts.mission,
      memorySummary: opts.memorySummary,
      objectionsSummary: opts.objectionsSummary,
      graphSummary: opts.graphSummary,
    });

    const start = Date.now();
    const response = await adapter.run({
      model: model.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      maxTokens: 5000,
      temperature: 0.35,
      timeoutMs: 30 * 60 * 1000,
    });

    const fallback: UltraPlanResult = {
      diagnosis: 'The organization has plateaued and needs strategic diversification.',
      abandoned_paths: ['Repeating prior structure without changing evidence strategy'],
      new_strategy: 'Pivot to a narrower, graph-cited, higher-evidence plan.',
      five_cycle_plan: [
        'Re-scope output structure around highest-confidence graph nodes.',
        'Force all factual claims to include graph citations.',
        'Elevate Critic grounding checks before synthesis.',
        'Use Devil’s Advocate to attack the new framing.',
        'Re-run ratchet with tightened novelty constraints.',
      ],
      risks: ['Overfitting to graph structure', 'Reduced creativity'],
      approval_needed: true,
      approval_reason: 'Strategic pivot affects future cycles.',
    };

    const parsed = parseStructuredOutputLenient(response.content, UltraPlanSchema, fallback);

    const db2 = getDb();
    db2.prepare(`
      UPDATE ultraplan_sessions
      SET status='completed', result_text=?, cost_usd=?, duration_ms=?, completed_at=datetime('now')
      WHERE id=?
    `).run(
      JSON.stringify(parsed),
      response.costUsd,
      Date.now() - start,
      sessionId
    );
    db2.close();

    return {
      sessionId,
      result: parsed,
      costUsd: response.costUsd,
    };
  }
}
7. Approval gate