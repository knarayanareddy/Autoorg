TypeScript

import { z } from 'zod';

export const DiffSummarySchema = z.object({
  summary: z.string(),
  files_changed: z.array(z.string()),
  risk_notes: z.array(z.string()),
  tests_suggested: z.array(z.string()),
  rollback_plan: z.string(),
});

export const DIFF_SUMMARIZER_SYSTEM_PROMPT = `
You summarize code changes from a REAL git diff.

Rules:
- Use the diff itself, not a guessed summary.
- Distinguish behavior change from refactor.
- Call out migration or rollback risk explicitly.
- If tests appear missing, say so.
- Keep the summary concise but specific.
`.trim();