import { z } from 'zod';

export const RegressionExplanationSchema = z.object({
  likely_causes: z.array(z.string()).max(8),
  affected_metrics: z.array(z.string()).max(8),
  hypotheses: z.array(z.string()).max(8),
  suggested_checks: z.array(z.string()).max(8),
  severity: z.enum(['warn', 'error', 'critical']),
});

export const REGRESSION_EXPLAINER_SYSTEM_PROMPT = `
You are the REGRESSION EXPLAINER for AutoOrg.
You explain benchmark regressions.

Inputs:
- baseline metrics
- current metrics
- case category
- model/template/constitution variants

Your job:
1. identify likely causes.
2. identify which metrics regressed meaningfully.
3. propose targeted debugging checks.

If cost or latency increased significantly without a score improvement, flag it.
If groundedness dropped, treat it as high severity.
`.trim();
