TypeScript

import { retrieveRelevantNodes, retrieveSubgraph } from '@/graph/retriever.js';
import type { AgentRole } from '@/types/index.js';

export function buildGraphQueryForRole(
  role: AgentRole,
  payload: Record<string, string | number | undefined>
): string {
  switch (role) {
    case 'CEO':
      return [
        String(payload.mission ?? ''),
        String(payload.assignment ?? ''),
        'task allocation synthesis priorities blockers',
      ].join('\n');

    case 'Engineer':
      return [
        String(payload.task ?? ''),
        String(payload.angle ?? ''),
        String(payload.targetSection ?? ''),
        String(payload.mission ?? ''),
        'facts evidence support constraints',
      ].join('\n');

    case 'Critic':
      return [
        String(payload.focus ?? ''),
        String(payload.engineerOutput ?? '').slice(0, 800),
        'unsupported claims contradictions missing evidence groundedness',
      ].join('\n');

    case 'DevilsAdvocate':
      return [
        String(payload.challenge ?? ''),
        String(payload.engineerOutput ?? '').slice(0, 600),
        String(payload.criticOutput ?? '').slice(0, 600),
        'contrarian alternative frame hidden assumption',
      ].join('\n');

    case 'Archivist':
      return [
        String(payload.searchTerms ?? ''),
        String(payload.mission ?? ''),
        'patterns anti-patterns repetition memory validated failed',
      ].join('\n');

    case 'RatchetJudge':
      return [
        String(payload.proposal ?? '').slice(0, 1200),
        'groundedness claim citation support graph entity relation',
      ].join('\n');

    default:
      return String(payload.mission ?? '');
  }
}

export async function buildGraphGroundedContext(
  runId: string,
  query: string
): Promise<string> {
  const top = await retrieveRelevantNodes(runId, query, 10);
  const ids = top.map(t => t.node_id);
  const sub = await retrieveSubgraph(runId, ids);

  const nodeLines = top.length > 0
    ? top.map(n => `- [${n.node_id}] (${n.type}) ${n.label} (score ${n.score.toFixed(2)})`).join('\n')
    : '[No strongly relevant nodes found]';

  const edgeLines = (sub.edges as Array<{ from_node_id: string; to_node_id: string; rel_type: string; weight: number }>)
    .slice(0, 30)
    .map(e => `- (${e.rel_type}) ${e.from_node_id} → ${e.to_node_id} (w=${Number(e.weight).toFixed(2)})`)
    .join('\n') || '[No relevant edges found]';

  return `
## GRAPH-GROUNDED CONTEXT (GraphRAG)
Use these nodes and edges to ground your reasoning.

### Relevant Nodes
${nodeLines}

### Relevant Edges
${edgeLines}

## CITATION RULES
- If you make a factual claim, cite at least one node ID in brackets, e.g.:
  "The system depends on remote inference. [n_ab12cd34ef]"
- If you cannot support a claim with a graph node, mark it:
  [NEEDS_GRAPH_SUPPORT]
- Prefer claims that can be grounded in the listed nodes/edges.
- When possible, cite 1-2 nodes, not 8.
`.trim();
}
7. Add src/graph/citations.ts
If you already created it, replace with this version. It also calculates grounded claim coverage.
