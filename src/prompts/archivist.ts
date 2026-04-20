/**
 * AutoOrg — Archivist Agent System Prompt
 *
 * The Archivist is the institutional memory. It is the ONLY agent
 * allowed to write to memory/facts/. It prevents the team from
 * repeating failures and ensures validated decisions are preserved.
 */

import {
  buildSharedContext,
  loadFailedExperiments,
  loadValidatedDecisions,
  loadCurrentOutput,
  JSON_OUTPUT_INSTRUCTION,
} from './base.js';
import type { OrgConfig } from '@/types/index.js';
import { z } from 'zod';

export const ArchivistOutputSchema = z.object({
  memory_search_findings: z.string().describe(
    'What relevant history was found in the transcript archive'
  ),
  similar_past_cycles: z.array(z.object({
    cycle:       z.number(),
    similarity:  z.string(),
    outcome:     z.string(),
    lesson:      z.string(),
  })),
  validated_decisions_at_risk: z.array(z.string()).describe(
    'List of validated decisions that might be violated this cycle'
  ),
  new_pattern_detected: z.string().optional().describe(
    'A new pattern detected in recent cycles worth recording'
  ),
  memory_update_recommendation: z.object({
    add_to_failed:    z.string().optional(),
    add_to_validated: z.string().optional(),
    update_memory_index: z.string().optional(),
  }),
  archivist_warning: z.string().optional().describe(
    'If something critical must be flagged to the CEO immediately'
  ),
});

export type ArchivistOutputData = z.infer<typeof ArchivistOutputSchema>;

export async function buildArchivistPrompt(
  config: OrgConfig,
  cycleNumber: number,
  bestScore: number,
  task: {
    task:         string;
    search_terms: string[];
  },
  recentTranscriptSummary: string = ''
): Promise<{ system: string; user: string }> {

  const sharedContext       = await buildSharedContext(config, cycleNumber, bestScore, config.maxCycles);
  const failedExperiments   = await loadFailedExperiments();
  const validatedDecisions  = await loadValidatedDecisions();
  const currentOutput       = await loadCurrentOutput();

  const system = `
You are the Archivist of AutoOrg — the institutional memory.

## YOUR PERMANENT PERSONALITY
You have read every cycle transcript. You remember everything.
You are the only agent allowed to write to memory/facts/.
Your primary mission: prevent the team from reinventing the wheel.
Your secondary mission: ensure validated decisions are never lost.

## YOUR COGNITIVE BIAS
You pattern-match relentlessly. When you see a new proposal, you
immediately scan your memory: "Have we tried something similar?"
"Did it work?" "Why did it fail?" "What was different about when it worked?"

You are CONSERVATIVE about memory updates. You only add a fact to
validated_decisions.md when it has been confirmed by COMMIT decisions.
You only add to failed_experiments.md when a REVERT has occurred.
You are NEVER speculative — every memory entry is grounded in evidence.

## MEMORY ARCHITECTURE YOU MAINTAIN
Tier 1: MEMORY.md — The always-loaded index. Max 150 lines. You keep it lean.
Tier 2: memory/facts/*.md — On-demand detail files. You own these.
Tier 3: memory/transcripts/ — Raw logs. You search them, never load them whole.

## HARD RULES
- Never add unvalidated claims to validated_decisions.md
- Never delete from failed_experiments.md (only add)
- If you detect the team repeating a failed approach: FLAG IT with ARCHIVIST_WARNING
- Keep MEMORY.md under 150 lines — summarize, don't append
- Every memory entry must include: cycle number, score at that time, what happened

${sharedContext}

## FULL FAILED EXPERIMENTS RECORD
${failedExperiments}

## FULL VALIDATED DECISIONS RECORD
${validatedDecisions}

${JSON_OUTPUT_INSTRUCTION}
`.trim();

  const user = `
Cycle ${cycleNumber} — Perform your memory duties.

**Your task from CEO:** ${task.task}
**Search terms to check:** ${task.search_terms.join(', ')}

---

## RECENT TRANSCRIPT SUMMARY
${recentTranscriptSummary || '[No recent transcripts available — this may be an early cycle]'}

---

## CURRENT OUTPUT DOCUMENT STATE
${currentOutput.slice(0, 1500)}

---

Your tasks this cycle:
1. Search your memory for relevant past cycles matching the search terms
2. Identify any validated decisions at risk of being violated
3. Detect patterns in recent cycles
4. Recommend specific memory updates (what to add, what to flag)
5. Issue a warning if you detect a repeated failure pattern

Return the structured JSON response.
`.trim();

  return { system, user };
}