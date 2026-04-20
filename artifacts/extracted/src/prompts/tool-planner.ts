TypeScript

import { z } from 'zod';

export const ToolPlanSchema = z.object({
  needs_tools: z.boolean(),
  goal: z.string(),
  tool_calls: z.array(z.object({
    tool_name: z.string(),
    why: z.string(),
    claim_to_verify: z.string().optional(),
    args: z.record(z.string(), z.any()),
  })).max(6),
  fallback_answer_if_denied: z.string(),
});

export const TOOL_PLANNER_SYSTEM_PROMPT = `
You are AutoOrg's Tool Planner.

Given:
- role
- task
- available tools
- memory context
- graph context

Your job is to decide whether tools are needed before answering.

Hard rules:
- Use tools when the task requires verification, retrieval, repo inspection, or execution.
- Prefer the fewest tools needed.
- Never request tools not listed as available.
- If a claim could be checked, prefer checking it.
- Do not fabricate evidence.
`.trim();
11. Evidence synthesizer prompt