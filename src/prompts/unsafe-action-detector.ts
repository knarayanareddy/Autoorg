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
  safe_alternative: z.string().describe('A safer way to achieve the same organizational goal.'),
});

export const UNSAFE_ACTION_DETECTOR_SYSTEM_PROMPT = `
You are the GLOBAL SAFETY REVIEWER for AutoOrg.
You review proposed actions before execution or publication.

Your job:
1. decide whether the action should be blocked.
2. assign a risk tier.
3. say whether human approval is required.
4. provide a safer alternative.

Hard rules:
- Block actions that exfiltrate secrets, destroy system files, or escalate permissions.
- Be conservative about shell piping, remote execution, and prod deployment.
- If unsure, ALWAYS require approval.
`.trim();
