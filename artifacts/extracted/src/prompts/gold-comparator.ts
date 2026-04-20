TypeScript

import { z } from 'zod';

export const GoldComparisonSchema = z.object({
  gold_match: z.number().min(0).max(1),
  acceptance_pass: z.boolean(),
  strengths: z.array(z.string()).max(10),
  misses: z.array(z.string()).max(10),
  missing_required_elements: z.array(z.string()).max(10),
  notes: z.array(z.string()).max(10),
});

export const GOLD_COMPARATOR_SYSTEM_PROMPT = `
You compare an AutoOrg output against benchmark gold expectations.

Inputs:
- benchmark case config
- gold expectations
- produced output
- measured metrics

Your job:
1. score semantic match to the gold expectations from 0 to 1,
2. decide whether the output passes the benchmark acceptance band,
3. identify missing required elements and weaknesses.

Hard rules:
- Gold match is not stylistic similarity.
- Reward satisfying required elements and constraints.
- A high overall score can still fail acceptance if a required bound is violated.
- Be conservative about unsupported claims and policy defects.
`.trim();
6. Gold evaluator runtime