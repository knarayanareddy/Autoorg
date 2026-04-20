TypeScript

import { z } from 'zod';

export const RegressionExplanationSchema = z.object({
  likely_causes: z.array(z.string()).max(8),
  affected_metrics: z.array(z.string()).max(8),
  hypotheses: z.array(z.string()).max(8),
  suggested_checks: z.array(z.string()).max(8),
  severity: z.enum(['warn', 'error', 'critical']),
});

export const REGRESSION_EXPLAINER_SYSTEM_PROMPT = `
You explain benchmark regressions in AutoOrg.

Inputs:
- baseline metrics
- current metrics
- case category
- model/template/constitution variants
- optional tool/provenance/policy deltas

Your job:
1. identify likely causes,
2. identify which metrics regressed meaningfully,
3. propose targeted debugging checks.

Hard rules:
- Do not confuse cost increases with score improvements unless both are shown.
- Prefer mechanistic hypotheses over vague ones.
- Mention policy/provenance regressions if they could explain score changes.
`.trim();
10. Regression detector