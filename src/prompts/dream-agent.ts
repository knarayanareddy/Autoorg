/**
 * AutoOrg — DreamAgent System Prompt
 *
 * The DreamAgent is the memory consolidator. It runs every N cycles
 * (or when triggered by a plateau). Its job:
 *
 * 1. Read recent transcript entries (tier 3)
 * 2. Extract patterns, anti-patterns, and insights
 * 3. Convert hedged observations → absolute facts
 * 4. Detect and resolve contradictions between facts
 * 5. Identify recurring failure modes (anti-patterns)
 * 6. Rewrite MEMORY.md index to reflect current state
 * 7. Update fact store with new/updated facts
 * 8. Produce a dream report for human review
 *
 * From Claude Code KAIROS leak:
 * "The autoDream logic merges disparate observations, removes logical
 *  contradictions, and converts vague insights into absolute facts.
 *  This background maintenance ensures that when the user returns,
 *  the agent's context is clean and highly relevant."
 */

import { z } from 'zod';

// ── Dream output schema ────────────────────────────────────────────────
export const DreamOutputSchema = z.object({

  // Patterns that worked
  validated_patterns: z.array(z.object({
    statement:  z.string().describe('Absolute fact: "Approach X consistently improves score by Y"'),
    confidence: z.number().min(0).max(1),
    evidence:   z.string().describe('Cycle numbers and scores that support this'),
    category:   z.enum(['validated_decision', 'pattern', 'domain_knowledge', 'agent_behavior']),
  })),

  // Patterns that failed
  anti_patterns: z.array(z.object({
    statement:  z.string().describe('Absolute fact: "Approach X consistently fails because Y"'),
    confidence: z.number().min(0).max(1),
    evidence:   z.string().describe('Cycle numbers and scores that support this'),
    severity:   z.enum(['high', 'medium', 'low']),
  })),

  // Contradictions found
  contradictions: z.array(z.object({
    fact_a:      z.string().describe('First contradicting fact'),
    fact_b:      z.string().describe('Second contradicting fact'),
    resolution:  z.string().describe('Which is correct and why'),
    keep:        z.enum(['a', 'b', 'neither', 'merge']),
    merged_fact: z.string().optional().describe('If keep=merge, the new merged fact'),
  })),

  // Facts to supersede (old facts that are now outdated)
  superseded_facts: z.array(z.object({
    old_statement: z.string(),
    reason:        z.string(),
    new_statement: z.string().optional(),
  })),

  // New domain knowledge extracted
  domain_knowledge: z.array(z.object({
    statement:  z.string(),
    confidence: z.number().min(0).max(1),
    source:     z.string().describe('Which cycle/agent this came from'),
  })),

  // Updated MEMORY.md index (rewritten from scratch)
  new_memory_index: z.string().describe(
    'The COMPLETE new content for MEMORY.md. Must be under 150 lines. Pointers only — no full content.'
  ),

  // Human-readable dream report
  dream_report: z.string().describe(
    'A 3-5 sentence summary of what changed, what was learned, and what the team should focus on next.'
  ),

  // Dream quality self-assessment
  quality_score: z.number().min(0).max(1).describe(
    'How confident are you in this consolidation? 1.0 = very confident, 0.0 = very uncertain'
  ),
});

export type DreamOutput = z.infer<typeof DreamOutputSchema>;

// ── Dream system prompt ────────────────────────────────────────────────
export function buildDreamSystemPrompt(): string {
  return `
You are the AutoOrg DreamAgent — the memory consolidator.

## YOUR ROLE
You run between active research cycles to consolidate what the organization
has learned. You are not reactive — you are reflective. You look at what
happened across multiple cycles and extract durable knowledge from it.

## YOUR PHILOSOPHY
RAW OBSERVATION:    "It seems like grounding claims might help..."
YOUR JOB:           "Grounding claims in entity X improves groundedness score by +0.08 on average."

RAW OBSERVATION:    "The Critic keeps raising objections about evidence..."
YOUR JOB:           "The Critic consistently raises MAJOR objections when claims cite general principles rather than specific entities from the seed material. This pattern appeared in cycles 3, 7, 12, and 18."

You convert VAGUE → SPECIFIC. You convert HEDGED → ABSOLUTE. You convert
OBSERVATIONS → FACTS. You convert MULTIPLE FAILURES → ANTI-PATTERNS.

## WHAT YOU ARE DOING
1. Reading recent transcript entries (cycles since last dream)
2. Reading the current fact store (existing validated knowledge)
3. Identifying what ACTUALLY worked vs. what ACTUALLY failed
4. Finding contradictions between current facts
5. Rewriting MEMORY.md to be clean, current, and under 150 lines
6. Producing a dream report that orients the team for the next cycles

## MEMORY.md RULES (CRITICAL)
The new MEMORY.md you produce MUST:
- Be under 150 lines (HARD LIMIT — the orchestrator truncates silently if exceeded)
- Contain POINTERS to memory files, not content
- Include the STATUS section with current counts
- Include the STANDING OBJECTIONS section (critical for agents)
- Include the ACTIVE CONSTRAINTS section (from org.md)
- Include RECENT PATTERNS (top 3-5 validated patterns)
- Include RECENT ANTI-PATTERNS (top 3-5 failure modes)
- NOT contain full fact text — just summaries and file references

## ABSOLUTE FACT FORMAT
Every fact must follow this pattern:
- SPECIFIC (names the exact approach/entity involved)
- MEASURABLE (includes score delta or cycle range when available)
- ACTIONABLE (implies what the team should do/avoid)
- GROUNDED (references actual cycles or scores from the transcripts)

BAD:  "Being specific helps"
GOOD: "Including entity names from seed material in Engineer drafts improves groundedness score by avg +0.07 (observed cycles 4, 8, 15)"

BAD:  "The Critic is strict"
GOOD: "Critic raises BLOCKER objections in 40% of cycles when proposal score < 0.55, always citing lack of seed material grounding"

## CONTRADICTION RESOLUTION
When two facts contradict:
1. Check which was more recently confirmed (more recent = likely more accurate)
2. Check which has higher confirmation count
3. Keep the higher-confidence, more-specific fact
4. Supersede the other with a note

## YOUR OUTPUT FORMAT
Return a single valid JSON object matching the DreamOutput schema.
`.trim();
}

// ── Dream user message builder ─────────────────────────────────────────
export function buildDreamUserMessage(opts: {
  cycleNumber:          number;
  dreamInterval:        number;
  transcriptSummary:    string;
  currentMemoryIndex:   string;
  currentFacts:         string;
  currentFailures:      string;
  currentValidated:     string;
  openObjections:       string;
  scoreHistory:         Array<{ cycle: number; score: number; decision: string }>;
  triggeredBy:          string;
}): string {
  const scoreTable = opts.scoreHistory
    .slice(-20)
    .map(s => `  Cycle ${s.cycle}: ${s.score.toFixed(4)} [${s.decision}]`)
    .join('\n');

  const avgScore = opts.scoreHistory.length > 0
    ? opts.scoreHistory.reduce((s, r) => s + r.score, 0) / opts.scoreHistory.length
    : 0;

  const commitRate = opts.scoreHistory.length > 0
    ? opts.scoreHistory.filter(r => r.decision === 'COMMIT').length / opts.scoreHistory.length
    : 0;

  return `
AutoOrg autoDream triggered at cycle ${opts.cycleNumber}.
Trigger reason: ${opts.triggeredBy}
Cycles since last dream: ${opts.dreamInterval}
Average score (recent): ${avgScore.toFixed(4)}
Commit rate (recent): ${(commitRate * 100).toFixed(0)}%

## SCORE HISTORY (recent cycles)
${scoreTable}

## CURRENT MEMORY INDEX (to be rewritten)
${opts.currentMemoryIndex}

## CURRENT FACT STORE
${opts.currentFacts}

## CURRENT FAILED EXPERIMENTS RECORD
${opts.currentFailures}

## CURRENT VALIDATED DECISIONS
${opts.currentValidated}

## OPEN OBJECTIONS
${opts.openObjections}

## TRANSCRIPT EVENTS (recent cycles — tier 3 search results)
${opts.transcriptSummary}

---

Perform your memory consolidation:
1. Extract patterns and anti-patterns from the transcript events
2. Identify and resolve any contradictions in current facts
3. Mark outdated facts for supersession
4. Extract new domain knowledge
5. Rewrite MEMORY.md (under 150 lines — strict)
6. Write the dream report

Return the complete DreamOutput JSON.
`.trim();
}
