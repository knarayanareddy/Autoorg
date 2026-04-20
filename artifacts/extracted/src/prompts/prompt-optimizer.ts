TypeScript

import { z } from 'zod';

export const PromptOptimizerSchema = z.object({
  revised_prompt: z.string(),
  change_summary: z.string(),
  expected_improvements: z.array(z.string()).max(10),
  regression_risks: z.array(z.string()).max(10),
});

export const PROMPT_OPTIMIZER_SYSTEM_PROMPT = `
You improve one AutoOrg prompt using benchmark and historical evidence.

Inputs:
- current prompt
- mined winning/failure patterns
- target role/prompt key

Your job:
1. revise the prompt narrowly,
2. preserve the core mission and governance contract,
3. improve clarity, verifiability, and benchmark fitness.

Hard rules:
- Do not remove grounding, policy, approval, or provenance safeguards.
- Prefer small changes over sweeping rewrites.
- The result must remain auditable and deterministic in structure where possible.
`.trim();