TypeScript

import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { UNSAFE_ACTION_DETECTOR_SYSTEM_PROMPT, UnsafeActionReviewSchema } from '@/prompts/unsafe-action-detector.js';

export class SafetyReview {
  constructor(private runId: string) {}

  async review(opts: {
    cycleNumber: number;
    actionId?: string;
    toolExecutionId?: string;
    actionClass: 'READ' | 'PROPOSE' | 'PATCH' | 'EXECUTE' | 'PUBLISH';
    targetRef: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }) {
    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const review = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: UNSAFE_ACTION_DETECTOR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            actionClass: opts.actionClass,
            targetRef: opts.targetRef,
            summary: opts.summary,
            metadata: opts.metadata ?? {},
          }, null, 2),
        },
      ],
      schema: UnsafeActionReviewSchema,
    });

    if (review.findings.length > 0 || review.blocked) {
      const db = getDb();
      for (const finding of review.findings) {
        db.prepare(`
          INSERT INTO security_findings
          (id, run_id, cycle_number, severity, category, action_id, tool_execution_id, summary, details_json, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
        `).run(
          `sf_${nanoid(10)}`,
          this.runId,
          opts.cycleNumber,
          review.risk_tier === 'critical' ? 'critical' : review.risk_tier === 'high' ? 'error' : 'warn',
          finding.category,
          opts.actionId ?? null,
          opts.toolExecutionId ?? null,
          finding.summary,
          JSON.stringify({ reason: finding.reason, safeAlternative: review.safe_alternative }),
        );
      }
      db.close();
    }

    return review;
  }
}
10. Provenance linker prompt