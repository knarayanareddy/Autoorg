TypeScript

import { z } from 'zod';

export const MemoryUtilitySchema = z.object({
  utility_score: z.number().min(0).max(1),
  keep_recommendation: z.boolean(),
  rationale: z.array(z.string()).max(8),
});

export const MEMORY_UTILITY_SYSTEM_PROMPT = `
You estimate whether a memory item is worth keeping.

Signals:
- retrieval frequency,
- citation frequency,
- contribution to successful benchmark runs,
- recency,
- duplication,
- governance relevance.

Hard rules:
- Prefer keeping policy/provenance-critical memory even if infrequently accessed.
- Prefer pruning duplicated, stale, low-signal memory.
- Be conservative about deleting anything tied to audits or approvals.
`.trim();