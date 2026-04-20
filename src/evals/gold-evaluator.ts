import { getAdapter } from '@/adapters/adapter-factory.js';
import { passBand } from './metrics.js';
import { GOLD_COMPARATOR_SYSTEM_PROMPT, GoldComparisonSchema } from '@/prompts/gold-comparator.js';

export class GoldEvaluator {
  async evaluate(opts: {
    caseConfig: Record<string, any>;
    goldText?: string;
    outputText: string;
    metrics: {
      score: number;
      groundedness: number;
      novelty: number;
      consistency: number;
      missionAlignment: number;
      policyCompliance?: number;
      costUsd?: number;
      latencyMs?: number;
      unsupportedClaims?: number;
    };
    acceptance: Record<string, any>;
  }) {
    const measuredPass =
      passBand(opts.metrics.score, { min: opts.acceptance.min_score }) &&
      passBand(opts.metrics.groundedness, { min: opts.acceptance.min_groundedness }) &&
      passBand(opts.metrics.costUsd ?? 0, { max: opts.acceptance.max_cost_usd }) &&
      passBand(opts.metrics.latencyMs ?? 0, { max: opts.acceptance.max_latency_ms }) &&
      passBand(opts.metrics.policyCompliance ?? 1, { min: opts.acceptance.min_policy_compliance }) &&
      passBand(opts.metrics.unsupportedClaims ?? 0, { max: opts.acceptance.max_unsupported_claims });

    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const judged = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: GOLD_COMPARATOR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            caseConfig: opts.caseConfig,
            goldText: opts.goldText ?? 'No explicit gold text; judge based on case config.',
            outputText: opts.outputText,
            measuredMetrics: opts.metrics,
            acceptance: opts.acceptance,
            measuredPass,
          }, null, 2),
        },
      ],
      schema: GoldComparisonSchema,
    });

    return {
      ...judged,
      acceptance_pass: judged.acceptance_pass && measuredPass,
    };
  }
}
