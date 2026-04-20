/**
 * AutoOrg — Graph Builder Orchestrator
 */

import chalk                        from 'chalk';
import { nanoid }                   from 'nanoid';
import { createHash }               from 'node:crypto';
import { getDb }                    from '@/db/migrate.js';
import { computeEmbeddingsBatch }   from '@/memory/embeddings.js';
import type { GraphDatabase, GraphNode } from './graph-db.js';
import type { OrgConfig }           from '@/types/index.js';
import { extractEntities, extractRelationships } from './extract.js';
import { deduplicateEntities }      from './normalize.js';

export interface GraphBuildResult {
  extractionId:    string;
  nodesExtracted:  number;
  edgesExtracted:  number;
  costUsd:         number;
  durationMs:      number;
}

export class GraphBuilder {
  private runId:   string;
  private graphDb: GraphDatabase;

  constructor(runId: string, graphDb: GraphDatabase) {
    this.runId   = runId;
    this.graphDb = graphDb;
  }

  async buildFromSeedMaterial(seedMaterial: string, config: OrgConfig): Promise<GraphBuildResult> {
    const extractionId = `extract_${nanoid(8)}`;
    const startMs      = Date.now();
    const sourceHash   = createHash('sha256').update(seedMaterial).digest('hex');

    console.log(chalk.cyan(`\n  🕸️  Building knowledge graph from seed material...`));

    // 1. Initial log
    const db = getDb();
    db.prepare(`INSERT INTO kg_extractions (id, run_id, extraction_type, source_hash, started_at) VALUES (?, ?, 'initial_seed', ?, datetime('now'))`).run(extractionId, this.runId, sourceHash);
    db.close();

    try {
      // 2. Extract Entities
      console.log(chalk.cyan(`     [1/4] Extracting entities...`));
      const { entities, costUsd: eCost, coverageScore } = await extractEntities(seedMaterial, config);
      
      // 3. Normalize & Embed
      console.log(chalk.cyan(`     [2/4] Normalizing & Embedding...`));
      const rawNodes = entities.map(e => ({
        label: e.label,
        type:  e.type,
        properties: { description: e.description, confidence: e.confidence, sourceText: e.sourceText, aliases: e.aliases ?? [] }
      }));
      const uniqueNodes = deduplicateEntities(rawNodes);
      
      const nodeTexts = uniqueNodes.map(n => `${n.label}: ${n.properties.description}`);
      const embeddings = await computeEmbeddingsBatch(nodeTexts);
      for (let i = 0; i < uniqueNodes.length; i++) uniqueNodes[i]!.embedding = embeddings[i];

      // 4. Insert Nodes
      console.log(chalk.cyan(`     [3/4] Inserting nodes...`));
      const nodeMap = new Map<string, GraphNode>();
      for (const node of uniqueNodes) {
        const created = await this.graphDb.createNode(node);
        nodeMap.set(node.label, created);
      }

      // 5. Extract Relationships
      console.log(chalk.cyan(`     [4/4] Extracting relationships...`));
      const { relationships, costUsd: rCost } = await extractRelationships(seedMaterial, Array.from(nodeMap.values()), config);
      
      let edgesCreated = 0;
      for (const rel of relationships) {
        const from = nodeMap.get(rel.fromEntity);
        const to   = nodeMap.get(rel.toEntity);
        if (!from || !to) continue;

        await this.graphDb.createEdge({
          fromNodeId: from.id,
          toNodeId:   to.id,
          relationship: rel.relationship,
          confidence:   rel.confidence,
          properties: { sourceText: rel.sourceText, ...(rel.properties ?? {}) }
        });
        edgesCreated++;
      }

      const durationMs = Date.now() - startMs;
      const totalCost  = eCost + rCost;

      const db2 = getDb();
      db2.prepare(`UPDATE kg_extractions SET nodes_extracted = ?, edges_extracted = ?, cost_usd = ?, duration_ms = ?, ended_at = datetime('now') WHERE id = ?`).run(uniqueNodes.length, edgesCreated, totalCost, durationMs, extractionId);
      db2.close();

      console.log(chalk.bold.cyan(`     ✓ Graph built: ${uniqueNodes.length} nodes, ${edgesCreated} edges ($${totalCost.toFixed(5)})`));

      return { extractionId, nodesExtracted: uniqueNodes.length, edgesExtracted: edgesCreated, costUsd: totalCost, durationMs };
    } catch (err) {
      console.error(chalk.red(`     ✗ Graph build failed: ${err}`));
      throw err;
    }
  }
}
