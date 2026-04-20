/**
 * AutoOrg — Graph Normalization & Deduplication
 */

import type { GraphNode, GraphEdge } from './graph-db.js';

export function canonicalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deduplicateEntities(nodes: Omit<GraphNode, 'id'>[]): Omit<GraphNode, 'id'>[] {
  const canonical = new Map<string, Omit<GraphNode, 'id'>>();
  
  for (const node of nodes) {
    const key = canonicalizeLabel(node.label);
    if (canonical.has(key)) {
      const existing = canonical.get(key)!;
      // Merge properties: keep highest confidence, combine aliases
      if ((node.properties.confidence as number ?? 0) > (existing.properties.confidence as number ?? 0)) {
        existing.label = node.label;
        existing.properties.confidence = node.properties.confidence;
      }
      const existingAliases = existing.properties.aliases as string[] ?? [];
      const newAliases      = node.properties.aliases as string[] ?? [];
      existing.properties.aliases = [...new Set([...existingAliases, ...newAliases, node.label])];
    } else {
      canonical.set(key, {
        ...node,
        properties: {
          ...node.properties,
          aliases: node.properties.aliases ?? [node.label]
        }
      });
    }
  }
  
  return Array.from(canonical.values());
}
