/**
 * AutoOrg — Ratchet Judge System Prompt
 *
 * The most powerful agent in the system. Its decision is final.
 * Always runs on the most capable available model (Opus by default).
 *
 * It scores against constitution.md — the immutable eval harness.
 * It is the LLM-as-judge implementation of the ratchet mechanism.
 */

import { loadConstitution, JSON_OUTPUT_INSTRUCTION } from './base.js';
import type { OrgConfig, CriticObjection } from '@/types/index.js';
import { z } from 'zod';

export const JudgeOutputSchema = z.object({
  groundedness: z.object({
    score:     z.number().min(0).max(1),
    reasoning: z.string(),
    grounded_claims:   z.number(),
    total_claims:      z.number(),
    ungrounded_examples: z.array(z.string()),
  }),
  novelty: z.object({
    score:     z.number().min(0).max(1),
    reasoning: z.string(),
    overlap_with_previous: z.string().describe('Which failed approaches does this repeat?'),
    novel_elements: z.array(z.string()),
  }),
  consistency: z.object({
    score:              z.number().min(0).max(1),
    reasoning:          z.string(),
    blocker_objections: z.array(z.string()).describe('BLOCKER objections that are unresolved'),
    major_objections:   z.array(z.string()).describe('MAJOR objections that are unresolved'),
    internal_contradictions: z.array(z.string()),
  }),
  evidence: z.object({
    score:     z.number().min(0).max(1),
    reasoning: z.string(),
    supported_claims: z.array(z.string()),
    unsupported_claims: z.array(z.string()),
  }),
  alignment: z.object({
    score:     z.number().min(0).max(1),
    reasoning: z.string(),
    mission_elements_covered:  z.array(z.string()),
    mission_elements_missing:  z.array(z.string()),
  }),
  composite: z.number().min(0).max(1),
  decision:  z.enum(['COMMIT', 'REVERT', 'DISQUALIFIED']),
  disqualification_reason: z.string().optional(),
  justification: z.string().describe(
    'One clear sentence explaining the decision and the single biggest factor'
  ),
  improvement_directive: z.string().describe(
    'The single most important thing the team should do differently next cycle'
  ),
});

export type JudgeOutputData = z.infer<typeof JudgeOutputSchema>;

export async function buildJudgePrompt(
  config: OrgConfig,
  cycleNumber: number,
  previousBestScore: number,
  proposal: string,
  criticObjections: CriticObjection[],
  failedExperiments: string,
  seedMaterialSummary: string,
  evidenceSummary: string
): Promise<{ system: string; user: string }> {

  const constitution = await loadConstitution();

  const system = `
You are the Ratchet Judge of AutoOrg.

## YOUR AUTHORITY
You are the most powerful agent in the system.
Your scoring decision is FINAL. The CEO cannot override you.
No agent can appeal your decision.
Your score determines whether this cycle's work is committed to git (kept)
or reverted (discarded).

## YOUR IDENTITY
You are an impartial, rigorous evaluator. You have no allegiance to any agent.
You do not care about effort — only output quality.
You do not give partial credit for "trying hard."
You do not penalize reasonable risk-taking that produces good output.

## YOUR SCORING FRAMEWORK
You score exactly according to constitution.md (provided below).
- **Novelty**: Is it a genuine step forward or literal repetition of history?
- **Consistency**: Does it introduce internal contradictions or ignore blockers?
- **Evidence**: Are the claims backed by tool-derived EVIDENCE? Unsupported claims should be penalized.
- **Alignment**: Does it cover the core mission elements?

You do NOT invent additional criteria.
You do NOT weight factors differently than the constitution specifies.
You DO flag automatic disqualifications before computing any scores.

## COMPOSITE SCORE FORMULA (from constitution.md)
  composite = (0.30 × groundedness) + (0.25 × novelty) + (0.25 × consistency) + (0.20 × alignment)

## RATCHET RULE
  IF composite > ${previousBestScore.toFixed(4)} (previous best):  COMMIT
  IF composite ≤ ${previousBestScore.toFixed(4)} (previous best):  REVERT
  IF auto-disqualification triggered:                              DISQUALIFIED (→ REVERT)

## AUTOMATIC DISQUALIFICATIONS (score = 0.0, decision = DISQUALIFIED)
1. Unresolved BLOCKER objection from Critic present in proposal
2. Output is fewer than 100 words
3. Proposal is semantically identical (>95% similar) to a previous proposal
4. Any agent claims to have modified constitution.md

## THE CONSTITUTION
${constitution}

${JSON_OUTPUT_INSTRUCTION}
`.trim();

  const blockerObjections = criticObjections
    .filter(o => o.severity === 'BLOCKER')
    .map(o => `- [${o.id}] ${o.description}`)
    .join('\n') || 'None';

  const majorObjections = criticObjections
    .filter(o => o.severity === 'MAJOR')
    .map(o => `- [${o.id}] ${o.description}`)
    .join('\n') || 'None';

  const user = `
Cycle ${cycleNumber} — Score this proposal.

**Previous best score:** ${previousBestScore.toFixed(4)}
**To COMMIT, this proposal must score >:** ${previousBestScore.toFixed(4)}

---

## CRITIC OBJECTIONS (from this cycle's Critic agent)

### BLOCKER Objections (unresolved = auto-penalty):
${blockerObjections}

### MAJOR Objections:
${majorObjections}

---

## SEED MATERIAL SUMMARY (for groundedness verification)
${seedMaterialSummary.slice(0, 2000)}

---

## FAILED EXPERIMENTS (for novelty check)
${failedExperiments.slice(0, 1500)}

---

## RECENT EVIDENCE TOOLS RETRIEVED:
${evidenceSummary}

## PROPOSAL TO EVALUATE:
${proposal.slice(0, 5000)}

---

Score this proposal rigorously according to the constitution.
Check every automatic disqualification first.
Then score each dimension with specific evidence.
Calculate the composite.
Make the COMMIT/REVERT/DISQUALIFIED decision.

Return the structured JSON response.
`.trim();

  return { system, user };
}