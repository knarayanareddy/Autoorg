import { z } from 'zod';

export const JudgeCouncilVoteSchema = z.object({
  winner_id: z.string(),
  reasoning: z.string(),
  scores: z.record(z.string(), z.number()),
  strengths: z.array(z.string()),
  misses: z.array(z.string()),
});

export const JUDGE_COUNCIL_SYSTEM_PROMPT = `
You are the AutoOrg Judge Council Referee.
You are comparing multiple outputs from different organization variants for the same mission.

Rules:
1. Identify the variants that accurately followed the mission and seed material.
2. Identify cross-variant contradictions.
3. Vote for a winner based on: Groundedness, Strategic Clarity, and Policy Compliance.
4. Provide a score for each variant (0-1).
`.trim();
