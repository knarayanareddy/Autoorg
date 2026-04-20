/**
 * AutoOrg — Graph Grounding Validator
 */

import type { GraphDatabase, GraphNode, GraphEdge } from './graph-db.js';

export interface GroundingResult {
  score:           number;
  supportingNodes: GraphNode[];
  supportingEdges: GraphEdge[];
  explanation:     string;
}

export class GraphGroundingValidator {
  private graphDb: GraphDatabase;

  constructor(graphDb: GraphDatabase) {
    this.graphDb = graphDb;
  }

  async validateClaim(claim: string): Promise<GroundingResult> {
    // Phase 4: Simple entity-based grounding
    // 1. Identify entities in claim (simple keyword match for now)
    const allNodes = await this.graphDb.findNodes({ limit: 1000 });
    const mentionedNodes = allNodes.filter(n => 
      claim.toLowerCase().includes(n.label.toLowerCase())
    );

    if (mentionedNodes.length === 0) {
      return {
        score: 0.1,
        supportingNodes: [],
        supportingEdges: [],
        explanation: 'No known entities mentioned in claim.'
      };
    }

    // 2. Check for relationships between mentioned nodes
    const supportingEdges: GraphEdge[] = [];
    if (mentionedNodes.length > 1) {
      for (const start of mentionedNodes) {
        for (const end of mentionedNodes) {
          if (start.id === end.id) continue;
          const edges = await this.graphDb.findEdges({ where: { fromNodeId: start.id, toNodeId: end.id } });
          supportingEdges.push(...edges);
        }
      }
    }

    const score = mentionedNodes.length > 0 ? Math.min(0.5 + (supportingEdges.length * 0.1), 1.0) : 0.1;

    return {
      score,
      supportingNodes: mentionedNodes,
      supportingEdges,
      explanation: `Found ${mentionedNodes.length} entities and ${supportingEdges.length} supporting relationships in the graph.`
    };
  }
}
