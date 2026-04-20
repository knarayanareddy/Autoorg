TypeScript

import chalk from 'chalk';
import { nanoid } from 'nanoid';
import { createHash } from 'node:crypto';
import { getDb } from '@/db/migrate.js';
import { createGraphStore } from './store/factory.js';
import { extractSeedGraph } from './extract.js';
import { normalizeExtractions, stableNodeId, stableEdgeId } from './normalize.js';
import { computeEmbeddingCached, serializeEmbedding } from '@/memory/embeddings.js';
import type { OrgConfig, ModelConfig, LLMProvider } from '@/types/index.js';
import type { GraphNode, GraphEdge } from './types.js';
import type { Fact } from '@/memory/fact-store.js';

async function cacheNodesAndEdges(runId: string, nodes: GraphNode[], edges: GraphEdge[]) {
  const db = getDb();

  for (const n of nodes) {
    const emb = await computeEmbeddingCached(`${n.label}\n${n.description ?? ''}`);
    db.prepare(`
      INSERT OR REPLACE INTO graph_node_cache
        (node_id, run_id, label, node_type, properties_json, embedding, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      n.id,
      runId,
      n.label,
      n.type,
      JSON.stringify({
        aliases: n.aliases ?? [],
        description: n.description ?? '',
        source: n.source ?? {},
        properties: n.properties ?? {},
      }),
      serializeEmbedding(emb)
    );
  }

  for (const e of edges) {
    db.prepare(`
      INSERT OR REPLACE INTO graph_edge_cache
        (id, run_id, from_node_id, to_node_id, rel_type, weight, properties_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      e.id,
      runId,
      e.from,
      e.to,
      e.type,
      e.weight ?? 0.7,
      JSON.stringify({
        evidence: e.evidence ?? '',
        properties: e.properties ?? {},
      })
    );
  }

  db.close();
}

export async function buildGraphFromSeed(
  runId: string,
  config: OrgConfig,
  opts?: { model?: ModelConfig }
): Promise<{ nodes: number; edges: number; merged: number; costUsd: number; ms: number }> {
  const startMs = Date.now();

  const seed = config.seedMaterial?.trim();
  if (!seed || seed.length < 100) {
    console.log(chalk.yellow('  ⚠ Seed material too small for graph build. Skipping.'));
    return { nodes: 0, edges: 0, merged: 0, costUsd: 0, ms: Date.now() - startMs };
  }

  const extractionModel: ModelConfig = opts?.model ?? (config.modelAssignments.Archivist ?? {
    provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as LLMProvider,
    model: 'claude-haiku-3-5',
  });

  const { raw, totalCostUsd } = await extractSeedGraph(seed, {
    model: extractionModel,
    onChunk: (i, total) => {
      console.log(chalk.cyan(`  🧠 Graph extraction ${i}/${total}`));
    },
  });

  const normalized = normalizeExtractions(runId, raw);

  const store = await createGraphStore();
  await store.init(runId);
  await store.upsertNodes(normalized.nodes);
  await store.upsertEdges(normalized.edges);
  const stats = await store.stats();
  await store.close();

  await cacheNodesAndEdges(runId, normalized.nodes, normalized.edges);

  const db = getDb();
  db.prepare(`
    INSERT INTO graph_builds
      (id, run_id, build_type, source_hash, node_count, edge_count, duplicates_merged, build_ms, llm_cost_usd)
    VALUES (?, ?, 'initial', ?, ?, ?, ?, ?, ?)
  `).run(
    `gb_${nanoid(8)}`,
    runId,
    createHash('sha256').update(seed).digest('hex'),
    stats.nodes,
    stats.edges,
    normalized.merged,
    Date.now() - startMs,
    totalCostUsd
  );
  db.close();

  console.log(chalk.green(`  ✅ Graph built: ${stats.nodes} nodes, ${stats.edges} edges, ${normalized.merged} merges`));

  return {
    nodes: stats.nodes,
    edges: stats.edges,
    merged: normalized.merged,
    costUsd: totalCostUsd,
    ms: Date.now() - startMs,
  };
}

function factNodeId(runId: string, statement: string): string {
  return stableNodeId(runId, 'Claim', statement.slice(0, 180));
}

async function findRelatedGraphNodes(runId: string, statement: string, topK = 3) {
  const qEmb = await computeEmbeddingCached(statement);
  const db = getDb();
  const rows = db.prepare(`
    SELECT node_id, label, node_type, embedding
    FROM graph_node_cache
    WHERE run_id = ? AND embedding IS NOT NULL
    LIMIT 500
  `).all(runId) as Array<{
    node_id: string;
    label: string;
    node_type: string;
    embedding: Buffer;
  }>;
  db.close();

  const { deserializeEmbedding, cosineSimilarity } = await import('@/memory/embeddings.js');

  return rows
    .map(r => ({
      nodeId: r.node_id,
      label: r.label,
      score: cosineSimilarity(qEmb, deserializeEmbedding(r.embedding)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter(r => r.score > 0.15);
}

export async function updateGraphFromFacts(
  runId: string,
  cycleNumber: number,
  facts: Fact[]
): Promise<{ nodes: number; edges: number; ms: number }> {
  const startMs = Date.now();
  if (facts.length === 0) return { nodes: 0, edges: 0, ms: 0 };

  const store = await createGraphStore();
  await store.init(runId);

  const newNodes: GraphNode[] = [];
  const newEdges: GraphEdge[] = [];

  for (const fact of facts) {
    const nodeId = factNodeId(runId, fact.statement);

    const node: GraphNode = {
      id: nodeId,
      runId,
      type: 'Claim',
      label: fact.statement.slice(0, 140),
      description: fact.statement,
      aliases: [],
      source: {
        kind: 'dream',
        cycle: cycleNumber,
        quote: fact.evidence ?? '',
      },
      properties: {
        category: fact.category,
        confidence: fact.confidence,
        sourceCycle: fact.sourceCycle,
      },
    };

    newNodes.push(node);

    const related = await findRelatedGraphNodes(runId, fact.statement, 3);
    for (const rel of related) {
      newEdges.push({
        id: stableEdgeId(runId, nodeId, rel.nodeId, fact.category === 'anti_pattern' ? 'CONTRADICTS' : 'SUPPORTS'),
        runId,
        from: nodeId,
        to: rel.nodeId,
        type: fact.category === 'anti_pattern' ? 'CONTRADICTS' : 'SUPPORTS',
        weight: Math.min(0.95, Math.max(0.3, fact.confidence)),
        evidence: fact.evidence ?? '',
        properties: {
          factCategory: fact.category,
          relatedLabel: rel.label,
        },
      });
    }
  }

  await store.upsertNodes(newNodes);
  await store.upsertEdges(newEdges);
  await store.close();

  await cacheNodesAndEdges(runId, newNodes, newEdges);

  const db = getDb();
  db.prepare(`
    INSERT INTO graph_builds
      (id, run_id, build_type, source_hash, node_count, edge_count, duplicates_merged, build_ms, llm_cost_usd)
    VALUES (?, ?, 'dream_update', ?, ?, ?, 0, ?, 0)
  `).run(
    `gb_${nanoid(8)}`,
    runId,
    createHash('sha256').update(`dream:${cycleNumber}:${facts.length}`).digest('hex'),
    newNodes.length,
    newEdges.length,
    Date.now() - startMs
  );
  db.close();

  return {
    nodes: newNodes.length,
    edges: newEdges.length,
    ms: Date.now() - startMs,
  };
}
5. Replace src/runtime/graph-manager.ts
This now supports both initial build and incremental dream updates.
