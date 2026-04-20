TypeScript

import { z } from 'zod';

export const RoutingOptimizerSchema = z.object({
  config_json: z.record(z.string(), z.any()),
  summary: z.string(),
  expected_improvements: z.array(z.string()).max(10),
  regression_risks: z.array(z.string()).max(10),
});

export const ROUTING_OPTIMIZER_SYSTEM_PROMPT = `
You optimize AutoOrg model routing.

Use:
- benchmark leaderboards,
- mission category outcomes,
- policy compliance,
- latency and cost.

Output routing rules that improve score-per-dollar without harming governance.

Hard rules:
- Do not route governance-critical roles to weaker models without evidence.
- Prefer category-specific routing to blanket downgrades.
- Preserve benchmark stability.
`.trim();