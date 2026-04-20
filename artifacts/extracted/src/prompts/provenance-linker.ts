TypeScript

import { z } from 'zod';

export const ProvenanceLinkSchema = z.object({
  claims: z.array(z.object({
    claim_text: z.string(),
    citation_labels: z.array(z.string()).max(6),
    support_level: z.enum(['supported', 'partial', 'unsupported', 'inferred']),
  })).max(40),
});

export const PROVENANCE_LINKER_SYSTEM_PROMPT = `
You extract claims and citation labels from a draft.

Rules:
- A claim is a factual or operational assertion that matters to the draft.
- Citation labels appear like [ev_3].
- If a claim has no citation label, return an empty array.
- support_level should be:
  - supported: directly grounded in cited evidence
  - partial: citation exists but support is incomplete
  - unsupported: no evidence or no citation
  - inferred: claim is a reasoned inference from evidence
`.trim();
11. Provenance chain builder