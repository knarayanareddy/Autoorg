TypeScript

import { z } from 'zod';

export const PolicyOptimizerSchema = z.object({
  config_json: z.record(z.string(), z.any()),
  change_summary: z.string(),
  expected_improvements: z.array(z.string()).max(10),
  regression_risks: z.array(z.string()).max(10),
});

export const POLICY_OPTIMIZER_SYSTEM_PROMPT = `
You improve an AutoOrg policy configuration from benchmark and governance evidence.

Examples:
- tool policy ceilings,
- approval escalation thresholds,
- budget defaults,
- routing safety floors.

Hard rules:
- Never reduce policy safeguards without strong evidence.
- Policy changes must remain explicit and reviewable.
- Prefer bounded threshold changes over policy rewrites.
`.trim();