TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

const NODE_REF = /\[(n_[a-f0-9]{10})\]/g;

export function splitClaims(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => s.length > 20);
}

export function extractCitations(text: string): Array<{ claim: string; nodeIds: string[] }> {
  const claims = splitClaims(text);
  const out: Array<{ claim: string; nodeIds: string[] }> = [];

  for (const claim of claims) {
    const ids = [...claim.matchAll(NODE_REF)].map(m => m[1]!);
    if (ids.length > 0) {
      out.push({
        claim,
        nodeIds: [...new Set(ids)],
      });
    }
  }

  return out;
}

export function storeCitations(
  runId: string,
  cycle: number,
  role: string,
  text: string
): { stored: number; totalClaims: number; citedClaims: number } {
  const claims = splitClaims(text);
  const citations = extractCitations(text);

  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO claim_citations
      (id, run_id, cycle_number, agent_role, claim_text, cited_node_ids, citation_quality)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const c of citations) {
      const quality = Math.min(1, 0.5 + c.nodeIds.length * 0.15);
      stmt.run(
        `cc_${nanoid(8)}`,
        runId,
        cycle,
        role,
        c.claim.slice(0, 1000),
        JSON.stringify(c.nodeIds),
        quality
      );
    }
  });

  tx();
  db.close();

  return {
    stored: citations.length,
    totalClaims: claims.length,
    citedClaims: citations.length,
  };
}

export function getCitationCoverage(runId: string, cycle: number): {
  totalClaims: number;
  citedClaims: number;
  coverage: number;
} {
  const db = getDb();
  const rows = db.prepare(`
    SELECT claim_text FROM claim_citations
    WHERE run_id = ? AND cycle_number = ?
  `).all(runId, cycle) as Array<{ claim_text: string }>;
  db.close();

  const citedClaims = rows.length;
  const totalClaims = Math.max(citedClaims, 1);
  return {
    totalClaims,
    citedClaims,
    coverage: citedClaims / totalClaims,
  };
}
8. Patch src/prompts/base.ts
Only change the shared-context function so it can accept a graph block.

Replace buildSharedContext(...) with:
TypeScript

export async function buildSharedContext(
  config: OrgConfig,
  cycleNumber: number,
  bestScore: number,
  maxCycles: number,
  graphContext?: string
): Promise<string> {
  const memoryIndex = await loadMemoryIndex();
  const currentOutput = await loadCurrentOutput();

  return `
${graphContext ? graphContext + '\n\n' : ''}## ORGANIZATIONAL CONTEXT
You are a member of an autonomous research organization called AutoOrg.
Your organization operates in a continuous improvement loop.

**Mission:** ${config.mission}

**Current Status:**
- Cycle: ${cycleNumber} of ${maxCycles}
- Best score achieved: ${bestScore.toFixed(4)} / 1.0
- Target score: ${config.targetScore}

## CONSTRAINTS (NEVER VIOLATE)
${config.constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## MEMORY INDEX (TIER 1 — ALWAYS LOADED)
${memoryIndex}

## CURRENT OUTPUT DOCUMENT
This is what your organization has produced so far. Your work this cycle
should improve upon it.

\`\`\`
${currentOutput}
\`\`\`
`.trim();
}
9. Patch src/prompts/ratchet-judge.ts
We’ll add explicit graph-aware groundedness rules.

Replace buildJudgePrompt(...) with:
TypeScript

export async function buildJudgePrompt(
  config: OrgConfig,
  cycleNumber: number,
  previousBestScore: number,
  proposal: string,
  criticObjections: CriticObjection[],
  failedExperiments: string,
  seedMaterialSummary: string,
  graphContext?: string
): Promise<{ system: string; user: string }> {

  const constitution = await loadConstitution();

  const system = `
You are the Ratchet Judge of AutoOrg.

## YOUR AUTHORITY
You are the most powerful agent in the system.
Your decision is final.

## YOUR SCORING FRAMEWORK
You score exactly according to constitution.md.

## GROUNDEDNESS RULE (PHASE 4)
Groundedness is now graph-aware:
- Claims with explicit node citations like [n_ab12cd34ef] count as grounded if the cited node exists and is relevant.
- Claims without graph citations are ungrounded unless they are direct paraphrases of the seed material summary.
- Sample at least 20 claims when possible.
- If the proposal repeatedly uses [NEEDS_GRAPH_SUPPORT], those claims are ungrounded.

## COMPOSITE SCORE FORMULA
composite = (0.30 × groundedness) + (0.25 × novelty) + (0.25 × consistency) + (0.20 × alignment)

## DECISION RULE
IF composite > ${previousBestScore.toFixed(4)}: COMMIT
IF composite ≤ ${previousBestScore.toFixed(4)}: REVERT
IF automatic disqualification: DISQUALIFIED

## AUTOMATIC DISQUALIFICATIONS
1. Unresolved BLOCKER objection from Critic still present
2. Output fewer than 100 words
3. Proposal semantically identical to previous proposal
4. Any agent claims to have modified constitution.md

## THE CONSTITUTION
${constitution}
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

${graphContext ? `${graphContext}\n\n` : ''}## CRITIC OBJECTIONS

### BLOCKER Objections
${blockerObjections}

### MAJOR Objections
${majorObjections}

## SEED MATERIAL SUMMARY
${seedMaterialSummary.slice(0, 2000)}

## FAILED EXPERIMENTS
${failedExperiments.slice(0, 1500)}

## PROPOSAL TO SCORE
${proposal.slice(0, 6000)}

Return structured JSON exactly matching the JudgeOutput schema.
`.trim();

  return { system, user };
}
10. Patch src/runtime/agent-runner.ts
This is the most important integration step.

We will:

build graph context per role
inject it into prompts
pass graph context to judge
store richer grounded prompts
A. Add imports near the top
TypeScript

import { buildGraphGroundedContext, buildGraphQueryForRole } from '@/runtime/grounded-context.js';
B. Add this helper inside agent-runner.ts
TypeScript

async function getRoleGraphContext(
  runId: string,
  role: AgentRole,
  payload: Record<string, string | number | undefined>
): Promise<string> {
  const query = buildGraphQueryForRole(role, payload);
  return buildGraphGroundedContext(runId, query);
}
C. Patch runCEOAssignment(...)
Replace the prompt build section with this:

TypeScript

  const graphContext = await getRoleGraphContext(ctx.runId, 'CEO', {
    mission: ctx.config.mission,
    assignment: 'task allocation synthesis blockers priorities',
  });

  const { system, user } = await buildCEOAssignmentPrompt(
    ctx.config, ctx.cycle, ctx.bestScore
  );

  const groundedUser = `${graphContext}\n\n${user}`;
Then update the call:

TypeScript

  const output = await callLLM(
    'CEO', ctx.cycleId, ctx.runId, ctx.cycle, modelConfig, system, groundedUser
  );
D. Patch runEngineer(...)
Replace prompt section with:

TypeScript

  const graphContext = await getRoleGraphContext(ctx.runId, 'Engineer', {
    mission: ctx.config.mission,
    task: task.task,
    angle: task.angle,
    targetSection: task.target_section,
  });

  const { system, user } = await buildEngineerPrompt(
    ctx.config, ctx.cycle, ctx.bestScore, task
  );

  const groundedUser = `${graphContext}\n\n${user}`;
Then use groundedUser in callLLM(...).

E. Patch runCritic(...)
Replace prompt build section with:

TypeScript

  const graphContext = await getRoleGraphContext(ctx.runId, 'Critic', {
    mission: ctx.config.mission,
    focus: task.focus,
    engineerOutput: engineerOutput.slice(0, 1000),
  });

  const { system, user } = await buildCriticPrompt(
    ctx.config, ctx.cycle, ctx.bestScore,
    task, engineerOutput, previousObjections
  );

  const groundedUser = `${graphContext}\n\n${user}`;
Then use groundedUser.

F. Patch runDevilsAdvocate(...)
Replace prompt build section with:

TypeScript

  const graphContext = await getRoleGraphContext(ctx.runId, 'DevilsAdvocate', {
    mission: ctx.config.mission,
    challenge: task.challenge,
    engineerOutput: engineerOutput.slice(0, 1000),
    criticOutput: criticOutput.slice(0, 1000),
  });

  const { system, user } = await buildAdvocatePrompt(
    ctx.config, ctx.cycle, ctx.bestScore,
    task, engineerOutput, criticOutput
  );

  const groundedUser = `${graphContext}\n\n${user}`;
Then use groundedUser.

G. Patch runArchivist(...)
Replace prompt section with:

TypeScript

  const graphContext = await getRoleGraphContext(ctx.runId, 'Archivist', {
    mission: ctx.config.mission,
    searchTerms: task.search_terms.join(', '),
  });

  const { system, user } = await buildArchivistPrompt(
    ctx.config, ctx.cycle, ctx.bestScore,
    task, recentTranscriptSummary
  );

  const groundedUser = `${graphContext}\n\n${user}`;
Then use groundedUser.

H. Patch runCEOSynthesis(...)
Replace prompt section with:

TypeScript

  const graphContext = await getRoleGraphContext(ctx.runId, 'CEO', {
    mission: ctx.config.mission,
    assignment: cycleAssessment,
  });

  const { system, user } = await buildCEOSynthesisPrompt(
    ctx.config,
    ctx.cycle,
    ctx.bestScore,
    {
      engineer: engineerOutput,
      critic: criticOutput,
      devilsAdvocate: advocateOutput,
      archivist: archivistOutput,
    },
    cycleAssessment,
    synthesisDirective
  );

  const groundedUser = `${graphContext}\n\n${user}`;
Then use groundedUser.

I. Patch runRatchetJudge(...)
Replace prompt build section with:

TypeScript

  const graphContext = await getRoleGraphContext(ctx.runId, 'RatchetJudge', {
    mission: ctx.config.mission,
    proposal: proposal.slice(0, 2000),
  });

  const { system, user } = await buildJudgePrompt(
    ctx.config,
    ctx.cycle,
    ctx.bestScore,
    proposal,
    criticObjections,
    failedExperiments,
    seedMaterialSummary,
    graphContext
  );
No extra prepend needed because judge prompt now accepts graph context directly.

11. Patch src/runtime/pipeline.ts
We want to store citations for engineer and CEO output.

Add import at top
TypeScript

import { storeCitations } from '@/graph/citations.js';
After Engineer output is produced, add:
TypeScript

  storeCitations(ctx.runId, ctx.cycle, 'Engineer', engineerOutput.content);
After CEO synthesis is produced, add:
TypeScript

  storeCitations(ctx.runId, ctx.cycle, 'CEO', ceoSynthesis.content);
12. Patch src/runtime/orchestrator.ts
We need to:

build graph at run start
update graph after dream from active facts
A. Add imports
TypeScript

import { graphManager } from './graph-manager.js';
B. After runId creation and before loop, initialize graph:
TypeScript

  graphManager.init(runId);
  await graphManager.ensureBuilt(config);
C. After memoryManager.initialize(runId);, keep this order:
TypeScript

  memoryManager.initialize(runId);
  graphManager.init(runId);
  await graphManager.ensureBuilt(config);
D. After a successful full dream run, update graph from facts
Inside the dream block, after:

TypeScript

const dreamResult = await dreamEngine.dream(
  config, cycleNumber, trigger, scoreHistory
);
Add:

TypeScript

        const activeFacts = memoryManager.getFactStore().getActiveFacts();
        await graphManager.updateFromFacts(cycleNumber, activeFacts.slice(-25));
That keeps graph updates bounded.

13. Add graph extraction API routes to src/api/server.ts
Add these imports near the top if needed:

TypeScript

import { getDb } from '@/db/migrate.js';
Then add the routes inside handleRequest(...).

A. GET /api/runs/:id/graph
TypeScript

    // GET /api/runs/:id/graph
    params = matchRoute(url, method, '/api/runs/:id/graph', 'GET');
    if (params) {
      const db = getDb();
      const nodes = db.prepare(`
        SELECT node_id, label, node_type, properties_json
        FROM graph_node_cache
        WHERE run_id = ?
        LIMIT 500
      `).all(params.id!) as Array<{
        node_id: string;
        label: string;
        node_type: string;
        properties_json: string;
      }>;

      const edges = db.prepare(`
        SELECT id, from_node_id, to_node_id, rel_type, weight, properties_json
        FROM graph_edge_cache
        WHERE run_id = ?
        LIMIT 1000
      `).all(params.id!) as Array<{
        id: string;
        from_node_id: string;
        to_node_id: string;
        rel_type: string;
        weight: number;
        properties_json: string;
      }>;

      const build = db.prepare(`
        SELECT * FROM graph_builds
        WHERE run_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(params.id!);

      db.close();

      return json({ nodes, edges, build });
    }
B. GET /api/runs/:runId/graph/:nodeId
TypeScript

    // GET /api/runs/:runId/graph/:nodeId
    params = matchRoute(url, method, '/api/runs/:runId/graph/:nodeId', 'GET');
    if (params) {
      const db = getDb();

      const node = db.prepare(`
        SELECT node_id, label, node_type, properties_json
        FROM graph_node_cache
        WHERE run_id = ? AND node_id = ?
      `).get(params.runId!, params.nodeId!);

      const neighbors = db.prepare(`
        SELECT e.id, e.from_node_id, e.to_node_id, e.rel_type, e.weight, e.properties_json,
               n.node_id, n.label, n.node_type, n.properties_json AS node_properties_json
        FROM graph_edge_cache e
        JOIN graph_node_cache n
          ON (n.node_id = e.to_node_id OR n.node_id = e.from_node_id)
        WHERE e.run_id = ?
          AND (e.from_node_id = ? OR e.to_node_id = ?)
          AND n.node_id != ?
        LIMIT 100
      `).all(params.runId!, params.nodeId!, params.nodeId!, params.nodeId!);

      db.close();

      if (!node) return notFound(`Graph node ${params.nodeId} not found`);
      return json({ node, neighbors });
    }
C. Optional groundedness coverage route
TypeScript

    // GET /api/runs/:id/citations
    params = matchRoute(url, method, '/api/runs/:id/citations', 'GET');
    if (params) {
      const db = getDb();
      const rows = db.prepare(`
        SELECT cycle_number, COUNT(*) AS cited_claims, AVG(citation_quality) AS avg_quality
        FROM claim_citations
        WHERE run_id = ?
        GROUP BY cycle_number
        ORDER BY cycle_number ASC
      `).all(params.id!);
      db.close();
      return json(rows);
    }
14. Add graph visualization component