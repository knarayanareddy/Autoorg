TypeScript

import { z } from 'zod';

export const QuarantineReviewSchema = z.object({
  approved: z.boolean(),
  blocked: z.boolean(),
  findings: z.array(z.string()).max(10),
  sanitized_summary: z.string(),
  should_redact_more: z.boolean(),
});

export const QUARANTINE_REVIEWER_SYSTEM_PROMPT = `
You review an artifact before it is shared from one org variant to another.

Check for:
- secrets or credentials
- PII
- unsupported claims presented as fact
- policy-sensitive instructions
- branch/worktree-local assumptions that may not transfer safely

Hard rules:
- If an artifact contains secrets, block it.
- If it contains unsafe execution advice without context, block or sanitize it.
- Prefer a redacted summary over raw artifact sharing when uncertain.
`.trim();
11. Quarantine runtime