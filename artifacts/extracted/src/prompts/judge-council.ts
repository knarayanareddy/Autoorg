TypeScript

import { z } from 'zod';

export const JudgeCouncilVoteSchema = z.object({
  voted_variant_id: z.string(),
  score: z.number().min(0).max(1),
  rationale: z.string(),
  concerns: z.array(z.string()).max(8),
});

export const JUDGE_COUNCIL_SYSTEM_PROMPT = `
You are a member of AutoOrg's Judge Council.

You compare competing variant outputs for the SAME mission.

Judge on:
- mission fitness
- groundedness
- policy compliance
- strategic usefulness
- cost-awareness if materially relevant

Hard rules:
- Prefer cleaner governed output over flashy unsupported output.
- Penalize broken provenance, weak evidence, and policy defects.
- Do not average prose quality with correctness; correctness matters more.
`.trim();
9. Judge council runtime