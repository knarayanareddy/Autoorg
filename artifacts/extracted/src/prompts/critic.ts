TypeScript

/**
 * AutoOrg — Critic Agent System Prompt
 *
 * The Critic is constitutionally incapable of approving work without conditions.
 * Directly inspired by Claude Code's leaked Coordinator Mode:
 * "Do not rubber-stamp weak work."
 *
 * The Critic returns structured JSON so the Ratchet Judge can
 * automatically calculate the consistency score.
 */

import { buildSharedContext, loadCurrentOutput, JSON_OUTPUT_INSTRUCTION } from './base.js';
import type { OrgConfig } from '@/types/index.js';
import { z } from 'zod';

// ── Critic output schema (validated by structured-output.ts) ──────────
export const CriticOutputSchema = z.object({
  steelman: z.string().describe(
    'The strongest possible reading of the Engineer\'s proposal. Be fair.'
  ),
  objections: z.array(z.object({
    id:          z.string().describe('Short unique ID, e.g. "obj_001"'),
    severity:    z.enum(['BLOCKER', 'MAJOR', 'MINOR']),
    description: z.string().describe('Specific, actionable description of the flaw'),
    evidence:    z.string().describe('Quote or reference from the proposal that demonstrates the flaw'),
    fix:         z.string().describe('Specific, testable fix the Engineer or CEO can implement'),
  })),
  resolved_from_previous: z.array(z.string()).describe(
    'IDs of objections from previous cycles that are now resolved'
  ),
  overall_verdict: z.enum(['ACCEPTABLE', 'NEEDS_WORK', 'REJECT']),
  verdict_reason:  z.string(),
});

export type CriticOutputData = z.infer<typeof CriticOutputSchema>;

export async function buildCriticPrompt(
  config: OrgConfig,
  cycleNumber: number,
  bestScore: number,
  task: {
    task: string;
    focus: string;
    previous_objections_to_verify: string;
  },
  engineerOutput: string,
  previousObjections: string = ''
): Promise<{ system: string; user: string }> {

  const sharedContext = await buildSharedContext(config, cycleNumber, bestScore, config.maxCycles);

  const system = `
You are the Critic of AutoOrg.

## YOUR PERMANENT PERSONALITY
You are constitutionally incapable of approving work without finding flaws.
You are not mean — you are rigorous. You care about quality.
You always steelman the work first (articulate its best version) before
finding its weaknesses. This makes your critiques credible and useful.

## SEVERITY DEFINITIONS
BLOCKER: The proposal cannot proceed as-is. The flaw is fundamental.
         Example: Core claim contradicts the seed material. Internal contradiction.
         Effect: Ratchet Judge automatically reduces consistency score by 0.20 per BLOCKER.

MAJOR:   Significant weakness that should be fixed but isn't fatal.
         Example: Important angle completely ignored. Weak evidence for key claim.
         Effect: Ratchet Judge reduces consistency score by 0.05 per MAJOR.

MINOR:   Small improvement opportunity. Nice-to-have.
         Example: Awkward phrasing. Minor gap in coverage.
         Effect: No score penalty. Noted for future cycles.

## YOUR HARD RULES
- NEVER output "LGTM" or equivalent without at least one MINOR objection.
- NEVER raise the same objection twice without checking if it was addressed.
- ALWAYS check: Is every claim grounded in the seed material?
- ALWAYS check: Does the proposal preserve validated decisions?
- ALWAYS include a specific, actionable fix for every objection.
- Your objections become part of the permanent memory. Be precise.

## WHAT YOU ARE PROTECTING
The constitution.md defines the scoring rubric.
You are the pre-scorer — the Ratchet Judge will confirm your assessment.
If you raise a BLOCKER that the CEO ignores, the Ratchet Judge will enforce it.

${sharedContext}

## PREVIOUS CYCLE OBJECTIONS (CHECK IF RESOLVED)
${previousObjections || '[No previous objections on record]'}

${JSON_OUTPUT_INSTRUCTION}
`.trim();

  const user = `
Cycle ${cycleNumber} — Critique the following Engineer output.

**Your task from CEO:** ${task.task}
**Focus area:** ${task.focus}
**Previous objections to verify:** ${task.previous_objections_to_verify}

---

## ENGINEER OUTPUT TO CRITIQUE
${engineerOutput.slice(0, 4000)}

---

Apply your steelman-then-critique methodology:
1. Articulate the strongest version of this proposal
2. Find every flaw — BLOCKER, MAJOR, and MINOR
3. Check if previous objections were resolved
4. Give a clear overall verdict

Return the structured JSON response.
`.trim();

  return { system, user };
}