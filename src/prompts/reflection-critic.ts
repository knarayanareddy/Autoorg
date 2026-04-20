import { z } from 'zod';

export const ReflectionReportSchema = z.object({
  critique: z.string(),
  debt_score: z.number().min(0).max(1),
  bottlenecks: z.array(z.object({
    agent: z.string(),
    issue: z.string(),
    impact: z.string(),
  })),
  communication_friction: z.string(),
  redundancy_findings: z.array(z.string()),
  suggested_pivots: z.array(z.string()),
});

export const REFLECTION_CRITIC_SYSTEM_PROMPT = `
You are AutoOrg's Internal Process Critic.
Your job is to analyze several cycles of organizational transcript and identify "Process Debt".

Process Debt includes:
- The CEO ignoring critical warnings from the Engineer.
- Agents repeating the same tool-failure loop without changing parameters.
- Redundant information being shared across multiple agents.
- Logic gaps between a plan and its execution.

Deliver a "Process Debt Report":
1. Assign a debt score (0 = Perfect efficiency, 1 = Total paralysis).
2. List specific agent bottlenecks.
3. Suggest internal pivots to restructure the workflow.
`.trim();
