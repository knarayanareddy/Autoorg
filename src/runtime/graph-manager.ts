// src/runtime/graph-manager.ts
// Lightweight in-process knowledge graph.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type { GraphNode, GraphEdge, KnowledgeGraph } from '@/types/index.js';

interface GraphManagerState {
  runId: string;
  graph: KnowledgeGraph;
  rootPath: string;
}

export class GraphManager {
  private state: GraphManagerState | null = null;

  init(runId: string, rootPath = process.cwd()) {
    this.state = {
      runId,
      rootPath,
      graph: { nodes: [], edges: [], version: 0 },
    };
  }

  private ensure(): GraphManagerState {
    if (!this.state) throw new Error('GraphManager not initialized. Call init(runId) first.');
    return this.state;
  }

  async ensureBuilt(config: {
    seedMaterial?: string[];
    workspaceRoot?: string;
  }) {
    const s = this.ensure();

    const graphPath = path.join(s.rootPath, 'memory', 'graph.json');
    await mkdir(path.dirname(graphPath), { recursive: true });

    try {
      const existing = JSON.parse(await readFile(graphPath, 'utf-8'));
      s.graph = existing;
      return;
    } catch {}

    // Build from seed material
    if (config.seedMaterial?.length) {
      for (const text of config.seedMaterial) {
        await this.ingest({ text, source: 'seed', weight: 1.0 });
      }
    }

    await this.persist();
  }

  async ingest(opts: { text: string; source: string; weight?: number }) {
    const s = this.ensure();

    // Extract simple concept nodes from key terms
    const terms = opts.text
      .split(/[\s,.:;()\[\]{}"']+/)
      .filter(t => t.length > 4 && t.length < 50)
      .slice(0, 50);

    for (const term of terms) {
      const existing = s.graph.nodes.find((n: GraphNode) => n.label.toLowerCase() === term.toLowerCase());
      if (existing) {
        existing.weight = Math.min(1, (existing.weight || 0) + 0.1);
      } else {
        s.graph.nodes.push({
          id: `node_${nanoid(8)}`,
          label: term,
          kind: 'concept',
          weight: opts.weight ?? 0.5,
          metadata: { source: opts.source }
        });
      }
    }

    s.graph.version++;
  }

  async persist() {
    const s = this.ensure();
    const graphPath = path.join(s.rootPath, 'memory', 'graph.json');
    await mkdir(path.dirname(graphPath), { recursive: true });
    await writeFile(graphPath, JSON.stringify(s.graph, null, 2));
  }

  async updateFromFacts(facts: string[]): Promise<void> {
    for (const fact of facts) {
      await this.ingest({ text: fact, source: 'ratchet_cycle' });
    }
    await this.persist();
  }

  getGraph(): KnowledgeGraph {
    return this.ensure().graph;
  }
}

export const graphManager = new GraphManager();
