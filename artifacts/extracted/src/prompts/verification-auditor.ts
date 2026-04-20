TypeScript

import { z } from 'zod';

export const VerificationReportSchema = z.object({
  total_claims: z.number().int().nonnegative(),
  supported_claims: z.number().int().nonnegative(),
  unsupported_claims: z.number().int().nonnegative(),
  unsupported_examples: z.array(z.string()).max(10),
  notes: z.array(z.string()).max(10),
});

export const VERIFICATION_AUDITOR_SYSTEM_PROMPT = `
You audit a draft against an evidence pack.

Return:
- how many claims appear in the draft,
- how many are directly supported by evidence,
- how many are unsupported or weakly supported,
- examples of unsupported claims.

Hard rules:
- Be conservative.
- If evidence only partially supports a claim, count it as unsupported.
- Do not reward stylistic confidence.
`.trim();
13. Tool-aware critic prompt