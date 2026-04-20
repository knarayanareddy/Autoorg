TypeScript

import { createHash } from 'node:crypto';
import type { GraphNode, GraphEdge, NodeType, EdgeType } from './types.js';
import type { GraphExtraction } from './prompts.js';

const TYPE_PRIORITY: Record<NodeType, number> = {
  Entity: 100,
  Concept: 90,
  Claim: 80,
  Constraint: 70,
  Metric: 60,
  Evidence: 50,
  Artifact: 40,
};

export function canonicalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[`"'’]/g, '')
    .replace(/[^a-z0-9\s\-_:/]/g, ' ')
    .replace(/\s+/g, ' ');
}

export function stableNodeId(runId: string, type: string, label: string): string {
  const h = createHash('sha256')
    .update(`${runId}:${type}:${canonicalizeLabel(label)}`)
    .digest('hex')
    .slice(0, 10);
  return `n_${h}`;
}

export function stableEdgeId(runId: string, from: string, to: string, type: string): string {
  const h = createHash('sha256')
    .update(`${runId}:${from}:${type}:${to}`)
    .digest('hex')
    .slice(0, 10);
  return `e_${h}`;
}

function chooseBetterType(a: NodeType, b: NodeType): NodeType {
  return TYPE_PRIORITY[b] > TYPE_PRIORITY[a] ? b : a;
}

function mergeDescriptions(a?: string, b?: string): string {
  if (!a) return b ?? '';
  if (!b) return a;
  if (a.length >= b.length) return a;
  return b;
}

export interface RawChunkExtraction {
  chunkId: string;
  extraction: GraphExtraction;
}

export function normalizeExtractions(
  runId: string,
  raw: RawChunkExtraction[]
): { nodes: GraphNode[]; edges: GraphEdge[]; merged: number } {
  const nodeMap = new Map<string, GraphNode>();
  const labelToNodeId = new Map<string, string>();
  const edgeMap = new Map<string, GraphEdge>();

  let merged = 0;

  for (const chunk of raw) {
    for (const n of chunk.extraction.nodes) {
      const canon = canonicalizeLabel(n.label);
      const preferredType = n.type;
      const existingId = labelToNodeId.get(canon);

      if (existingId) {
        const existing = nodeMap.get(existingId)!;
        existing.type = chooseBetterType(existing.type, preferredType);
        existing.description = mergeDescriptions(existing.description, n.description);
        existing.aliases = [...new Set([...(existing.aliases ?? []), ...(n.aliases ?? []), n.label])]
          .filter(Boolean);
        if (!existing.source?.quote && n.quote) {
          existing.source = {
            ...(existing.source ?? { kind: 'seed' }),
            kind: 'seed',
            chunkId: chunk.chunkId,
            quote: n.quote,
          };
        }
        merged++;
      } else {
        const id = stableNodeId(runId, preferredType, n.label);
        const node: GraphNode = {
          id,
          runId,
          type: preferredType,
          label: n.label.trim(),
          aliases: [...new Set([...(n.aliases ?? []), n.label.trim()])],
          description: n.description?.trim() ?? '',
          source: {
            kind: 'seed',
            chunkId: chunk.chunkId,
            quote: n.quote?.trim() ?? '',
          },
          properties: {},
        };
        nodeMap.set(id, node);
        labelToNodeId.set(canon, id);
      }
    }
  }

  for (const chunk of raw) {
    for (const e of chunk.extraction.edges) {
      const fromCanon = canonicalizeLabel(e.from_label);
      const toCanon = canonicalizeLabel(e.to_label);

      const fromId = labelToNodeId.get(fromCanon);
      const toId = labelToNodeId.get(toCanon);

      if (!fromId || !toId) continue;
      if (fromId === toId) continue;

      const id = stableEdgeId(runId, fromId, toId, e.type);
      const existing = edgeMap.get(id);

      if (existing) {
        existing.weight = Math.max(existing.weight ?? 0.5, e.weight ?? 0.7);
        if (!existing.evidence && e.evidence) existing.evidence = e.evidence;
      } else {
        edgeMap.set(id, {
          id,
          runId,
          from: fromId,
          to: toId,
          type: e.type as EdgeType,
          weight: e.weight ?? 0.7,
          evidence: e.evidence?.trim() ?? '',
          properties: {},
        });
      }
    }
  }

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    merged,
  };
}
3. Add src/graph/extract.ts
This separates extraction from build orchestration.
