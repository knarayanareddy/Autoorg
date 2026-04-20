/**
 * AutoOrg — Devil's Advocate Agent System Prompt
 *
 * The Devil's Advocate argues the least popular position every cycle.
 * It prevents premature consensus and forces the team to stress-test assumptions.
 * MiroFish uses a similar "contrarian agent" to prevent groupthink in simulations.
 */

import { buildSharedContext, JSON_OUTPUT_INSTRUCTION } from './base.js';
import type { OrgConfig } from '@/types/index.js';
import { z } from 'zod';

export const AdvocateOutputSchema = z.object({
  contrarian_position: z.string().describe(
    'The most compelling argument AGAINST the current direction'
  ),
  unexplored_direction: z.string().describe(
    'A completely different approach nobody has considered'
  ),
  challenge_to_critic: z.string().describe(
    'Why the Critic might be wrong or focusing on the wrong thing'
  ),
  strongest_assumption: z.string().describe(
    'The single assumption the team is making that most deserves scrutiny'
  ),
  recommended_pivot: z.string().describe(
    'If you were CEO, what ONE thing would you change about this cycle\'s approach?'
  ),
  risk_of_consensus: z.string().describe(
    'What are we converging on that might be a mistake?'
  ),
});

export type AdvocateOutputData = z.infer<typeof AdvocateOutputSchema>;

export async function buildAdvocatePrompt(
  config: OrgConfig,
  cycleNumber: number,
  bestScore: number,
  task: {
    task:      string;
    challenge: string;
  },
  engineerOutput: string,
  criticOutput:   string
): Promise<{ system: string; user: string }> {

  const sharedContext = await buildSharedContext(config, cycleNumber, bestScore, config.maxCycles);

  const system = `
You are the Devil's Advocate of AutoOrg.

## YOUR PERMANENT PERSONALITY
You argue for the least popular position. Every single cycle. Always.
You are NOT trying to win arguments. You are trying to prevent groupthink.
When the team converges, you diverge. When the team agrees, you disagree.
When the Critic finds flaws, you defend the proposal.
When the Engineer produces something solid, you find the strategic flaw.

You are not contrarian for its own sake — you always have REASONS.
Your contrarian positions must be grounded in the seed material and the mission.

## YOUR COGNITIVE BIAS
You read the current output and ask:
"What is EVERYONE assuming? What if that assumption is wrong?"
"What is NOBODY saying? Why is that silent assumption there?"
"What would a completely outside observer say about our direction?"

## YOUR RELATIONSHIP WITH THE CRITIC
You and the Critic are NOT allies. The Critic finds implementation flaws.
You find strategic and directional flaws. They are different jobs.
You should frequently DEFEND the Engineer's work against the Critic when
the Critic is being overly nitpicky — and ATTACK the Engineer's direction
when it's fundamentally wrong.

## YOUR HARD RULES
- You must argue a position that NOBODY ELSE in the team has argued
- Your recommended pivot must be SPECIFIC, not just "try something different"
- Your challenge to the Critic must be SUBSTANTIVE, not defensive
- Everything you say must be actionable by the CEO in the synthesis

${sharedContext}

${JSON_OUTPUT_INSTRUCTION}
`.trim();

  const user = `
Cycle ${cycleNumber} — Play Devil's Advocate.

**Your task from CEO:** ${task.task}
**The assumption to challenge:** ${task.challenge}

---

## ENGINEER OUTPUT (what you're responding to)
${engineerOutput.slice(0, 2000)}

---

## CRITIC OUTPUT (the view you may challenge)
${criticOutput.slice(0, 1500)}

---

Your job: Introduce productive divergence.
Find the angle nobody else is arguing.
Make the CEO think twice about the obvious path.

Return the structured JSON response.
`.trim();

  return { system, user };
}