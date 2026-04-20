TypeScript

import { getDb } from '@/db/migrate.js';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function exportGraphAsJson(runId: string): string {
  const db = getDb();
  const nodes = db.prepare(`
    SELECT node_id, label, node_type, properties_json
    FROM graph_node_cache
    WHERE run_id = ?
  `).all(runId);

  const edges = db.prepare(`
    SELECT id, from_node_id, to_node_id, rel_type, weight, properties_json
    FROM graph_edge_cache
    WHERE run_id = ?
  `).all(runId);

  db.close();

  return JSON.stringify({
    runId,
    nodes,
    edges,
    exportedAt: new Date().toISOString(),
  }, null, 2);
}

export function exportGraphAsGraphML(runId: string): string {
  const db = getDb();

  const nodes = db.prepare(`
    SELECT node_id, label, node_type, properties_json
    FROM graph_node_cache
    WHERE run_id = ?
  `).all(runId) as Array<{
    node_id: string;
    label: string;
    node_type: string;
    properties_json: string;
  }>;

  const edges = db.prepare(`
    SELECT id, from_node_id, to_node_id, rel_type, weight, properties_json
    FROM graph_edge_cache
    WHERE run_id = ?
  `).all(runId) as Array<{
    id: string;
    from_node_id: string;
    to_node_id: string;
    rel_type: string;
    weight: number;
    properties_json: string;
  }>;

  db.close();

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<graphml xmlns="http://graphml.graphdrawing.org/xmlns">`,
    `<key id="label" for="node" attr.name="label" attr.type="string"/>`,
    `<key id="type" for="node" attr.name="type" attr.type="string"/>`,
    `<key id="props" for="node" attr.name="props" attr.type="string"/>`,
    `<key id="rel_type" for="edge" attr.name="rel_type" attr.type="string"/>`,
    `<key id="weight" for="edge" attr.name="weight" attr.type="double"/>`,
    `<key id="edge_props" for="edge" attr.name="edge_props" attr.type="string"/>`,
    `<graph id="autoorg" edgedefault="directed">`,
    ...nodes.map(n => [
      `<node id="${escapeXml(n.node_id)}">`,
      `<data key="label">${escapeXml(n.label)}</data>`,
      `<data key="type">${escapeXml(n.node_type)}</data>`,
      `<data key="props">${escapeXml(n.properties_json ?? '{}')}</data>`,
      `</node>`,
    ].join('')),
    ...edges.map(e => [
      `<edge id="${escapeXml(e.id)}" source="${escapeXml(e.from_node_id)}" target="${escapeXml(e.to_node_id)}">`,
      `<data key="rel_type">${escapeXml(e.rel_type)}</data>`,
      `<data key="weight">${Number(e.weight ?? 0.7)}</data>`,
      `<data key="edge_props">${escapeXml(e.properties_json ?? '{}')}</data>`,
      `</edge>`,
    ].join('')),
    `</graph>`,
    `</graphml>`,
  ].join('\n');

  return xml;
}
5. Patch src/graph/build.ts to snapshot graph after builds
Add this import at top:

TypeScript

import { snapshotGraphState } from './snapshots.js';
Replace the buildGraphFromSeed(...) function body’s build-id section
Inside buildGraphFromSeed(...), replace the graph_build insert section with:

TypeScript

  const buildId = `gb_${nanoid(8)}`;

  const db = getDb();
  db.prepare(`
    INSERT INTO graph_builds
      (id, run_id, build_type, source_hash, node_count, edge_count, duplicates_merged, build_ms, llm_cost_usd)
    VALUES (?, ?, 'initial', ?, ?, ?, ?, ?, ?)
  `).run(
    buildId,
    runId,
    createHash('sha256').update(seed).digest('hex'),
    stats.nodes,
    stats.edges,
    normalized.merged,
    Date.now() - startMs,
    totalCostUsd
  );
  db.close();

  await snapshotGraphState(runId, buildId, 'initial');
Replace the updateGraphFromFacts(...) graph_build insert section with:
TypeScript

  const buildId = `gb_${nanoid(8)}`;
  const db = getDb();
  db.prepare(`
    INSERT INTO graph_builds
      (id, run_id, build_type, source_hash, node_count, edge_count, duplicates_merged, build_ms, llm_cost_usd)
    VALUES (?, ?, 'dream_update', ?, ?, ?, 0, ?, 0)
  `).run(
    buildId,
    runId,
    createHash('sha256').update(`dream:${cycleNumber}:${facts.length}`).digest('hex'),
    newNodes.length,
    newEdges.length,
    Date.now() - startMs
  );
  db.close();

  await snapshotGraphState(runId, buildId, `dream_cycle_${cycleNumber}`);
6. Graph-aware Critic hardening
We’ll make the Critic explicitly list uncited claims, but also add a deterministic synthetic objection if citation coverage is weak.

Patch src/prompts/critic.ts
Replace the schema with this backward-compatible version:
TypeScript

export const CriticOutputSchema = z.object({
  steelman: z.string(),
  objections: z.array(z.object({
    id: z.string(),
    severity: z.enum(['BLOCKER', 'MAJOR', 'MINOR']),
    description: z.string(),
    evidence: z.string(),
    fix: z.string(),
  })),
  resolved_from_previous: z.array(z.string()),
  overall_verdict: z.enum(['ACCEPTABLE', 'NEEDS_WORK', 'REJECT']),
  verdict_reason: z.string(),

  // Phase 4.1 additions
  uncited_claims: z.array(z.string()).optional(),
  invalid_citations: z.array(z.string()).optional(),
  graph_support_gaps: z.array(z.object({
    claim: z.string(),
    reason: z.string(),
  })).optional(),
});
In the system prompt, add this under HARD RULES:
TypeScript

- You MUST identify uncited factual claims separately from ordinary writing flaws.
- Claims with [NEEDS_GRAPH_SUPPORT] are graph-support gaps, not necessarily invalid, but they reduce quality.
- If a proposal makes many factual claims without graph citations, raise at least a MAJOR objection.
- If most factual claims lack graph support, raise a BLOCKER.
In the user prompt add:
TypeScript

Additional requirement:
- List uncited factual claims in uncited_claims
- List invalid graph citations in invalid_citations
- List graph support gaps in graph_support_gaps
Patch src/runtime/agent-runner.ts inside runCritic(...)
Add imports near top:

TypeScript

import {
  validateGroundednessDeterministic,
  storeGroundednessReport,
} from '@/graph/groundedness-validator.js';
Now inside runCritic(...), after const parsedData = ..., add:

TypeScript

  // Phase 4.1 hardening: deterministic groundedness check on Engineer output
  const grounding = validateGroundednessDeterministic(ctx.runId, engineerOutput);
  storeGroundednessReport(ctx.runId, ctx.cycle, 'Engineer', grounding);

  const uncitedClaims = grounding.claims
    .filter(c => c.status === 'uncited')
    .slice(0, 8)
    .map(c => c.claim);

  const invalidCitations = grounding.invalidRefs;

  // Inject deterministic findings into parsed critic output
  parsedData.uncited_claims = [
    ...(parsedData.uncited_claims ?? []),
    ...uncitedClaims,
  ].slice(0, 12);

  parsedData.invalid_citations = [
    ...(parsedData.invalid_citations ?? []),
    ...invalidCitations,
  ].slice(0, 12);

  // Synthetic deterministic objection if citation quality is poor
  if (grounding.totalClaims >= 5) {
    if (grounding.validCoverage < 0.25) {
      parsedData.objections.unshift({
        id: 'obj_graph_grounding_blocker',
        severity: 'BLOCKER',
        description: `Most factual claims lack valid graph citations (${grounding.validCitedClaims}/${grounding.totalClaims} grounded).`,
        evidence: grounding.uncitedExamples[0] ?? 'Multiple claims are uncited or invalidly cited.',
        fix: 'Revise the proposal so each factual claim cites at least one valid graph node ID.',
      });
    } else if (grounding.validCoverage < 0.60) {
      parsedData.objections.unshift({
        id: 'obj_graph_grounding_major',
        severity: 'MAJOR',
        description: `Grounded citation coverage is weak (${grounding.validCitedClaims}/${grounding.totalClaims} grounded claims).`,
        evidence: grounding.uncitedExamples[0] ?? 'Several claims appear without valid graph support.',
        fix: 'Add valid graph node citations to unsupported claims and remove claims without graph support.',
      });
    }
  }
This makes Critic graph-discipline deterministic, not just prompt-based.

7. Deterministic groundedness in Judge scoring
We’ll feed the deterministic report into the Judge prompt and clamp the final groundedness score.

Patch src/prompts/ratchet-judge.ts
Update function signature:
TypeScript

export async function buildJudgePrompt(
  config: OrgConfig,
  cycleNumber: number,
  previousBestScore: number,
  proposal: string,
  criticObjections: CriticObjection[],
  failedExperiments: string,
  seedMaterialSummary: string,
  graphContext?: string,
  deterministicGroundingSummary?: string
): Promise<{ system: string; user: string }> {
In the user prompt, insert this block before proposal:
TypeScript

## DETERMINISTIC GROUNDEDNESS VALIDATION
${deterministicGroundingSummary ?? '[No deterministic groundedness report available]'}

Interpretation rule:
- Your groundedness score should be close to the deterministic valid coverage.
- Do NOT score groundedness above the deterministic valid coverage unless you can clearly justify why uncited claims are direct paraphrases of the seed material.
Patch src/runtime/agent-runner.ts inside runRatchetJudge(...)
Add imports:

TypeScript

import {
  validateGroundednessDeterministic,
  groundednessSummaryForPrompt,
  storeGroundednessReport,
} from '@/graph/groundedness-validator.js';
Now inside runRatchetJudge(...), before building the prompt, add:

TypeScript

  const deterministicGrounding = validateGroundednessDeterministic(ctx.runId, proposal);
  storeGroundednessReport(ctx.runId, ctx.cycle, 'CEO', deterministicGrounding);
  const deterministicSummary = groundednessSummaryForPrompt(deterministicGrounding);
Then change buildJudgePrompt(...) call to:

TypeScript

  const { system, user } = await buildJudgePrompt(
    ctx.config,
    ctx.cycle,
    ctx.bestScore,
    proposal,
    criticObjections,
    failedExperiments,
    seedMaterialSummary,
    graphContext,
    deterministicSummary
  );
Then after parsedData is parsed, add deterministic clamp:

TypeScript

  // Phase 4.1 hardening: clamp groundedness to deterministic valid coverage
  const deterministicCap = deterministicGrounding.validCoverage;
  parsedData.groundedness.score = Math.min(
    parsedData.groundedness.score,
    deterministicCap
  );

  parsedData.groundedness.reasoning =
    `${parsedData.groundedness.reasoning} ` +
    `[Deterministic cap applied: ${(deterministicCap * 100).toFixed(0)}% valid citation coverage.]`;

  // Recompute composite after clamp
  parsedData.composite =
    (0.30 * parsedData.groundedness.score) +
    (0.25 * parsedData.novelty.score) +
    (0.25 * parsedData.consistency.score) +
    (0.20 * parsedData.alignment.score);

  // Recompute decision after clamp
  if (parsedData.decision !== 'DISQUALIFIED') {
    parsedData.decision = parsedData.composite > ctx.bestScore ? 'COMMIT' : 'REVERT';
  }
This is the main hardening win.

8. Graph search API + export + diff API
Patch src/api/server.ts.

Add imports near top:

TypeScript

import { retrieveRelevantNodes } from '@/graph/retriever.js';
import { exportGraphAsJson, exportGraphAsGraphML } from '@/graph/export.js';
import { listGraphSnapshots, diffGraphSnapshots } from '@/graph/snapshots.js';
Then inside handleRequest(...) add these routes.

A. Search route
TypeScript

    // GET /api/runs/:id/graph/search?q=...
    params = matchRoute(url, method, '/api/runs/:id/graph/search', 'GET');
    if (params) {
      const q = url.searchParams.get('q')?.trim() ?? '';
      if (!q) return json({ results: [] });

      const results = await retrieveRelevantNodes(params.id!, q, 20);
      return json({ results });
    }
B. Snapshots route
TypeScript

    // GET /api/runs/:id/graph/snapshots
    params = matchRoute(url, method, '/api/runs/:id/graph/snapshots', 'GET');
    if (params) {
      return json(listGraphSnapshots(params.id!));
    }
C. Diff route
TypeScript

    // GET /api/runs/:id/graph/diff?before=...&after=...
    params = matchRoute(url, method, '/api/runs/:id/graph/diff', 'GET');
    if (params) {
      const snapshots = listGraphSnapshots(params.id!);
      const before = url.searchParams.get('before') ?? snapshots[1]?.id;
      const after = url.searchParams.get('after') ?? snapshots[0]?.id;

      if (!before || !after) {
        return json({
          addedNodes: [],
          removedNodes: [],
          addedEdges: [],
          removedEdges: [],
        });
      }

      return json(diffGraphSnapshots(before, after));
    }
D. Export route
TypeScript

    // GET /api/runs/:id/graph/export?format=json|graphml
    params = matchRoute(url, method, '/api/runs/:id/graph/export', 'GET');
    if (params) {
      const format = (url.searchParams.get('format') ?? 'json').toLowerCase();

      if (format === 'graphml') {
        const xml = exportGraphAsGraphML(params.id!);
        return new Response(xml, {
          status: 200,
          headers: {
            ...CORS,
            'Content-Type': 'application/graphml+xml',
            'Content-Disposition': `attachment; filename="autoorg-${params.id}-graph.graphml"`,
          },
        });
      }

      const jsonText = exportGraphAsJson(params.id!);
      return new Response(jsonText, {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="autoorg-${params.id}-graph.json"`,
        },
      });
    }
9. Graph search UI