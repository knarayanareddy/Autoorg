TypeScript

export type NodeType =
  | 'Entity'
  | 'Concept'
  | 'Claim'
  | 'Constraint'
  | 'Metric'
  | 'Evidence'
  | 'Artifact';

export type EdgeType =
  | 'MENTIONS'
  | 'DEFINES'
  | 'SUPPORTS'
  | 'CONTRADICTS'
  | 'CAUSES'
  | 'ENABLED_BY'
  | 'CONSTRAINS'
  | 'MEASURES'
  | 'PART_OF'
  | 'RELATED_TO';

export interface GraphNode {
  id: string;
  runId: string;
  type: NodeType;
  label: string;
  aliases?: string[];
  description?: string;
  source?: {
    kind: 'seed' | 'dream' | 'memory';
    chunkId?: string;
    quote?: string;
    cycle?: number;
  };
  properties?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  runId: string;
  from: string;
  to: string;
  type: EdgeType;
  weight?: number;
  evidence?: string;
  properties?: Record<string, unknown>;
}

export interface ExtractionResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphStats {
  nodes: number;
  edges: number;
  merged: number;
}
2. Add src/graph/normalize.ts
This handles dedup, canonical labels, alias merging, stable IDs, and edge dedup.
