TypeScript

import { z } from 'zod';

export const ImprovementProposalSchema = z.object({
  proposal_type: z.enum(['prompt', 'policy', 'role', 'routing', 'memory_prune', 'adapter_distill']),
  target_key: z.string(),
  rationale: z.string(),
  expected_benefits: z.array(z.string()).max(10),
  expected_risks: z.array(z.string()).max(10),
  should_simulate: z.boolean(),
});

export const IMPROVEMENT_PROPOSER_SYSTEM_PROMPT = `
You convert mined patterns into a single bounded self-improvement proposal.

Hard rules:
- Recommend a narrow, testable change.
- The target must be simulatable or auditable.
- Do not propose vague "make everything smarter" changes.
- Do not weaken policy or provenance safeguards.
`.trim();
7. Proposal manager