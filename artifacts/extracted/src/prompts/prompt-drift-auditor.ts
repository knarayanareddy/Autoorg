TypeScript

import { z } from 'zod';

export const PromptDriftSchema = z.object({
  drift_score: z.number().min(0).max(1),
  regression_risk: z.number().min(0).max(1),
  likely_shifts: z.array(z.string()).max(10),
  blocked: z.boolean(),
  summary: z.string(),
});

export const PROMPT_DRIFT_AUDITOR_SYSTEM_PROMPT = `
You audit whether a candidate prompt revision causes harmful behavioral drift.

Watch for:
- weaker evidence discipline,
- weaker critique quality,
- weaker governance language,
- role confusion,
- unexplained output-style changes that affect benchmark fitness.

Hard rules:
- Large semantic shifts require caution even if wording changes are small.
- If governance language is weakened, treat risk as high.
- Prefer narrow prompt edits over broad tone changes.
`.trim();