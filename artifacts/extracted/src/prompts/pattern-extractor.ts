TypeScript

import { z } from 'zod';

export const PatternReportSchema = z.object({
  winning_patterns: z.array(z.string()).max(20),
  failure_patterns: z.array(z.string()).max(20),
  cost_quality_tradeoffs: z.array(z.string()).max(12),
  governance_patterns: z.array(z.string()).max(12),
  candidate_targets: z.array(z.object({
    proposal_type: z.enum(['prompt', 'policy', 'role', 'routing', 'memory_prune', 'adapter_distill']),
    target_key: z.string(),
    why: z.string(),
  })).max(20),
  summary: z.string(),
});

export const PATTERN_EXTRACTOR_SYSTEM_PROMPT = `
You are AutoOrg's Pattern Miner.

You will receive:
- successful benchmark runs,
- failed/regressed runs,
- policy and provenance signals,
- cost and latency information,
- role/template/routing information.

Your job:
1. identify repeatable winning patterns,
2. identify repeatable failure patterns,
3. identify cost-quality tradeoffs,
4. identify concrete improvement targets.

Hard rules:
- Prefer patterns grounded in repeated evidence, not one-off anecdotes.
- Separate quality gains from governance regressions.
- Do not recommend changes that would weaken auditability.
`.trim();
5. Pattern miner