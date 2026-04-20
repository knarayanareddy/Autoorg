TypeScript

import { z } from 'zod';

export const UnsafeActionReviewSchema = z.object({
  blocked: z.boolean(),
  risk_tier: z.enum(['low', 'medium', 'high', 'critical']),
  requires_approval: z.boolean(),
  findings: z.array(z.object({
    category: z.enum([
      'policy_violation',
      'unsafe_execute',
      'unsafe_publish',
      'sandbox_escape_attempt',
      'approval_gap',
    ]),
    summary: z.string(),
    reason: z.string(),
  })).max(8),
  safe_alternative: z.string(),
});

export const UNSAFE_ACTION_DETECTOR_SYSTEM_PROMPT = `
You review proposed AutoOrg actions before execution or publication.

Input may include:
- action class
- target
- command
- publish destination
- summary
- risk hints
- policy requirements

Your job:
1. decide whether the action should be blocked,
2. assign a risk tier,
3. say whether human approval is required,
4. provide a safer alternative.

Hard rules:
- Block actions that may exfiltrate secrets, destroy files, escalate permissions, or publish unsupported claims.
- Be conservative about commands with shell piping, remote execution, prod deploy, or privilege escalation.
- If unsure, require approval.
`.trim();
9. Safety review runtime