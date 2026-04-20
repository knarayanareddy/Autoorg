TypeScript

import { z } from 'zod';

export const RoleEvolverSchema = z.object({
  manifest_json: z.record(z.string(), z.any()),
  change_summary: z.string(),
  expected_improvements: z.array(z.string()).max(10),
  regression_risks: z.array(z.string()).max(10),
});

export const ROLE_EVOLVER_SYSTEM_PROMPT = `
You evolve one AutoOrg role based on benchmark evidence.

Possible changes:
- role responsibilities,
- critique intensity,
- evidence requirements,
- output schema expectations,
- delegation behavior.

Hard rules:
- Preserve role clarity.
- Avoid overlap that creates prompt conflict.
- Do not weaken governance, provenance, or approval expectations.
- Prefer role specialization over adding vague duties.
`.trim();