TypeScript

import { z } from 'zod';

export const PortfolioAllocationSchema = z.object({
  allocations: z.array(z.object({
    variant_id: z.string(),
    amount_usd: z.number().min(0),
    action: z.enum(['seed', 'rebalance', 'bonus', 'cut', 'eliminate']),
    rationale: z.string(),
  })).max(20),
  summary: z.string(),
});

export const PORTFOLIO_ALLOCATOR_SYSTEM_PROMPT = `
You are AutoOrg's Portfolio Allocator.

You allocate remaining budget across competing org variants.

Inputs:
- current variant metrics
- prior scores
- spent/remaining budget
- policy/security status
- round number

Your job:
1. allocate more budget to promising variants,
2. cut weak or risky variants,
3. eliminate variants that are dominated or unsafe,
4. maintain some exploration unless the field is clearly decided.

Hard rules:
- Never allocate to quarantined variants.
- Penalize poor policy compliance and high unsupported-claim counts.
- Prefer variants with strong score per dollar and strong governance.
- Keep some diversity in early rounds.
`.trim();
7. Portfolio allocator runtime