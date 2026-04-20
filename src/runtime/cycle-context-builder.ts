/**
 * AutoOrg — Cycle Context Builder
 *
 * Builds the rich, structured context that each agent receives.
 * Every agent sees a different slice of truth:
 *   - CEO (assign): full overview, memory, failed experiments
 *   - Engineer: task + current output + seed material grounding
 *   - Critic: engineer output + standing objections + constitution excerpt
 *   - Advocate: engineer + critic + contrarian brief
 *   - Archivist: transcripts + memory facts only (no current proposal)
 *   - CEO (synthesis): all worker outputs + directive
 *   - Judge: proposal + objections + constitution + seed material
 *
 * Also stores context to DB for post-run agent interviews.
 */

import { readFile }     from 'node:fs/promises';
import { existsSync }   from 'node:fs';
import { createHash }   from 'node:crypto';
import { getDb }        from '@/db/migrate.js';
import { nanoid }       from 'nanoid';
import type { OrgConfig, AgentRole } from '@/types/index.js';
import type { ObjectionTracker, Objection } from './objection-tracker.js';

interface AgentContext {
  systemPrompt: string;
  userMessage:  string;
}

// ── Context storage ────────────────────────────────────────────────────
export function storeCycleContext(
  cycleId:   string,
  runId:     string,
  role:      AgentRole,
  context:   AgentContext,
  response:  string
): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO cycle_context
      (id, cycle_id, run_id, agent_role, system_prompt, user_message, response)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(nanoid(8), cycleId, runId, role, context.systemPrompt, context.userMessage, response);
  db.close();
}

export function loadCycleContext(cycleId: string, role: AgentRole): AgentContext & { response: string } | null {
  const db  = getDb();
  const row = db.prepare(`
    SELECT system_prompt, user_message, response
    FROM cycle_context WHERE cycle_id = ? AND agent_role = ?
  `).get(cycleId, role) as { system_prompt: string; user_message: string; response: string } | undefined;
  db.close();

  if (!row) return null;
  return {
    systemPrompt: row.system_prompt,
    userMessage:  row.user_message,
    response:     row.response,
  };
}

// ── Safe file loader ───────────────────────────────────────────────────
async function safeRead(filePath: string, maxChars = 3000): Promise<string> {
  if (!existsSync(filePath)) return `[File not found: ${filePath}]`;
  const content = await readFile(filePath, 'utf-8');
  return content.slice(0, maxChars) + (content.length > maxChars ? '\n\n[... truncated ...]' : '');
}

// ── Build agent-specific context objects ──────────────────────────────
export class CycleContextBuilder {
  private config:     OrgConfig;
  private cycle:      number;
  private bestScore:  number;
  private maxCycles:  number;
  private objections: ObjectionTracker;

  constructor(
    config:    OrgConfig,
    cycle:     number,
    bestScore: number,
    objections: ObjectionTracker
  ) {
    this.config     = config;
    this.cycle      = cycle;
    this.bestScore  = bestScore;
    this.maxCycles  = config.maxCycles;
    this.objections = objections;
  }

  // ── Shared header all agents see ──────────────────────────────────
  private async sharedHeader(): Promise<string> {
    const memoryIndex    = await safeRead('./memory/MEMORY.md', 2000);
    const currentOutput  = await safeRead('./workspace/current_output.md', 2500);

    return `
## ORGANIZATIONAL CONTEXT
**Organization:** AutoOrg
**Mission:** ${this.config.mission}
**Cycle:** ${this.cycle} / ${this.maxCycles}
**Best score:** ${this.bestScore.toFixed(4)} / 1.0
**Target score:** ${this.config.targetScore}

## CONSTRAINTS (ABSOLUTE — NEVER VIOLATE)
${this.config.constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## MEMORY INDEX (TIER 1)
${memoryIndex}

## CURRENT OUTPUT DOCUMENT
\`\`\`
${currentOutput}
\`\`\`
`.trim();
  }

  // ── CEO Assignment Context ─────────────────────────────────────────
  async forCEOAssignment(): Promise<string> {
    const shared           = await this.sharedHeader();
    const failedExperiments = await safeRead('./memory/facts/failed_experiments.md', 2000);
    const objectionSummary = this.objections.formatForContext(8);
    const stats            = this.objections.getStats();

    return `
${shared}

## STANDING OBJECTIONS FROM CRITIC
Total: ${stats.total} | Open: ${stats.open} | Resolved: ${stats.resolved}
Open Blockers: ${stats.blockers} | Open Majors: ${stats.majors}

${objectionSummary}

## FAILED EXPERIMENTS (AVOID REPEATING)
${failedExperiments}
`.trim();
  }

  // ── Engineer Context ───────────────────────────────────────────────
  async forEngineer(): Promise<string> {
    const shared           = await this.sharedHeader();
    const validatedDecisions = await safeRead('./memory/facts/validated_decisions.md', 1500);
    const domainKnowledge  = await safeRead('./memory/facts/domain_knowledge.md', 1500);
    const openBlockers     = this.objections.getOpenBlockers();

    return `
${shared}

## VALIDATED DECISIONS (MUST PRESERVE IN YOUR OUTPUT)
${validatedDecisions}

## DOMAIN KNOWLEDGE (GROUNDING FACTS)
${domainKnowledge}

## ACTIVE BLOCKERS (YOUR OUTPUT MUST ADDRESS THESE)
${openBlockers.length === 0
  ? '[No active blockers — write freely]'
  : openBlockers.map(b => `🚨 BLOCKER [${b.id}]: ${b.description}\n   Fix: ${b.proposedFix}`).join('\n\n')
}

## SEED MATERIAL (GROUND EVERY CLAIM IN THIS)
${this.config.seedMaterial.slice(0, 3000)}
`.trim();
  }

  // ── Critic Context (receives Engineer output) ──────────────────────
  async forCritic(engineerOutput: string): Promise<string> {
    const shared        = await this.sharedHeader();
    const constitution  = await safeRead('./constitution.md', 2000);
    const allObjections = this.objections.getAllObjections();

    const previousObjectionSummary = allObjections
      .slice(0, 15)
      .map(o => `[${o.id}] (Cycle ${o.cycleRaised}) ${o.severity}: ${o.description.slice(0, 100)} | ${o.resolved ? '✓ RESOLVED' : '○ OPEN'}`)
      .join('\n');

    return `
${shared}

## CONSTITUTION SCORING DIMENSIONS (what you are checking against)
${constitution}

## COMPLETE OBJECTION HISTORY FOR THIS RUN
${previousObjectionSummary || '[No previous objections]'}

## ENGINEER OUTPUT TO CRITIQUE (THIS CYCLE)
${engineerOutput.slice(0, 4000)}

## SEED MATERIAL (for groundedness verification)
${this.config.seedMaterial.slice(0, 2000)}
`.trim();
  }

  // ── Devil's Advocate Context (receives Engineer AND Critic output) ──
  async forDevilsAdvocate(engineerOutput: string, criticOutput: string): Promise<string> {
    const shared = await this.sharedHeader();

    return `
${shared}

## ENGINEER OUTPUT (what you are responding to)
${engineerOutput.slice(0, 2500)}

## CRITIC OUTPUT (the view you may challenge or extend)
${criticOutput.slice(0, 2000)}

## STANDING OPEN OBJECTIONS
${this.objections.formatForContext(5)}
`.trim();
  }

  // ── Archivist Context (memory-focused — limited proposal access) ───
  async forArchivist(transcriptSummary: string): Promise<string> {
    const failedExperiments  = await safeRead('./memory/facts/failed_experiments.md', 3000);
    const validatedDecisions = await safeRead('./memory/facts/validated_decisions.md', 2000);
    const stats              = this.objections.getStats();

    return `
## ARCHIVIST BRIEF — Cycle ${this.cycle}

**Mission:** ${this.config.mission}
**Cycle:** ${this.cycle} / ${this.maxCycles}
**Best score:** ${this.bestScore.toFixed(4)}

## OBJECTION STATISTICS
Total raised: ${stats.total} | Still open: ${stats.open} | Resolved: ${stats.resolved}
Oldest open objection: Cycle ${stats.oldestOpenCycle ?? 'N/A'}

## FULL FAILED EXPERIMENTS RECORD
${failedExperiments}

## FULL VALIDATED DECISIONS RECORD
${validatedDecisions}

## RECENT TRANSCRIPT EVENTS (TIER 3 — search results)
${transcriptSummary}
`.trim();
  }

  // ── CEO Synthesis Context (all worker outputs) ─────────────────────
  async forCEOSynthesis(
    engineerOutput:   string,
    criticOutput:     string,
    advocateOutput:   string,
    archivistOutput:  string,
    cycleAssessment:  string,
    directive:        string
  ): Promise<string> {
    const openBlockers  = this.objections.getOpenBlockers();
    const openObjections = this.objections.getOpenObjections();

    return `
## CEO SYNTHESIS BRIEF — Cycle ${this.cycle}

**Mission:** ${this.config.mission}
**Current best score:** ${this.bestScore.toFixed(4)}
**Open BLOCKERs:** ${openBlockers.length} (must all be addressed)
**Total open objections:** ${openObjections.length}

## YOUR EARLIER CYCLE ASSESSMENT
${cycleAssessment}

## YOUR SYNTHESIS DIRECTIVE
${directive}

## OPEN BLOCKERS (ALL MUST BE RESOLVED IN SYNTHESIS)
${openBlockers.length === 0
  ? '[None — proceed freely]'
  : openBlockers.map(b => `🚨 [${b.id}]: ${b.description}\n   Fix: ${b.proposedFix}`).join('\n\n')
}

---

## ENGINEER OUTPUT
${engineerOutput.slice(0, 3000)}

---

## CRITIC OUTPUT (with objections)
${criticOutput.slice(0, 2000)}

---

## DEVIL'S ADVOCATE OUTPUT
${advocateOutput.slice(0, 1500)}

---

## ARCHIVIST OUTPUT
${archivistOutput.slice(0, 1500)}
`.trim();
  }

  // ── Ratchet Judge Context ──────────────────────────────────────────
  async forRatchetJudge(proposal: string): Promise<string> {
    const constitution       = await safeRead('./constitution.md');
    const failedExperiments  = await safeRead('./memory/facts/failed_experiments.md', 1500);
    const openBlockers       = this.objections.getOpenBlockers();
    const openMajors         = this.objections.getOpenObjections().filter(o => o.severity === 'MAJOR');

    return `
## RATCHET JUDGE BRIEF — Cycle ${this.cycle}

**Previous best score:** ${this.bestScore.toFixed(4)}
**To COMMIT, this proposal must score:** > ${this.bestScore.toFixed(4)}

## THE CONSTITUTION (your scoring framework)
${constitution}

## STANDING OPEN BLOCKERS (BEFORE THIS PROPOSAL)
${openBlockers.length === 0
  ? '[No open blockers — check if proposal created new ones]'
  : openBlockers.map(b => `🚨 [${b.id}]: ${b.description}`).join('\n')
}

## STANDING OPEN MAJORS
${openMajors.length === 0
  ? '[None]'
  : openMajors.map(m => `⚠ [${m.id}]: ${m.description}`).join('\n')
}

## FAILED EXPERIMENTS (for novelty scoring)
${failedExperiments}

## SEED MATERIAL (for groundedness scoring)
${this.config.seedMaterial.slice(0, 2000)}

## PROPOSAL TO SCORE
${proposal.slice(0, 5000)}
`.trim();
  }
}
