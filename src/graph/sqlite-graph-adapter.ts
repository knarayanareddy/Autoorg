/**
 * AutoOrg — SQLite Graph Database Adapter
 */

import { nanoid }                     from 'nanoid';
import { getDb }                      from '@/db/migrate.js';
import { serializeEmbedding,
         deserializeEmbedding }       from '@/memory/embeddings.js';
import type {
  GraphDatabase, GraphNode, GraphEdge,
  GraphPath, GraphQuery, GraphStats,
} from './graph-db.js';

export class SQLiteGraphDB implements GraphDatabase {
  readonly backend = 'sqlite' as const;
  private runId:     string;
  private connected: boolean = false;

  constructor(runId: string) {
    this.runId = runId;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async createNode(node: Omit<GraphNode, 'id'>): Promise<GraphNode> {
    const id  = `node_${nanoid(8)}`;
    const db  = getDb();

    const embBuf = node.embedding ? serializeEmbedding(node.embedding) : null;

    db.prepare(`
      INSERT INTO kg_nodes
        (id, run_id, label, node_type, properties, source_text, confidence, embedding, canonical_form)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, this.runId, node.label, node.type,
      JSON.stringify(node.properties),
      (node.properties.sourceText as string) ?? node.label,
      (node.properties.confidence as number) ?? 0.5,
      embBuf,
      this.canonicalize(node.label)
    );
    db.close();

    return { id, ...node };
  }

  async getNode(id: string): Promise<GraphNode | null> {
    const db  = getDb();
    const row = db.prepare(`SELECT * FROM kg_nodes WHERE id = ? AND run_id = ?`).get(id, this.runId) as Record<string, unknown> | undefined;
    db.close();
    if (!row) return null;
    return this.rowToNode(row);
  }

  async getNodeByLabel(label: string): Promise<GraphNode | null> {
    const canonical = this.canonicalize(label);
    const db        = getDb();
    const row       = db.prepare(`SELECT * FROM kg_nodes WHERE canonical_form = ? AND run_id = ? LIMIT 1`).get(canonical, this.runId) as Record<string, unknown> | undefined;
    db.close();
    if (!row) return null;
    return this.rowToNode(row);
  }

  async findNodes(query: GraphQuery): Promise<GraphNode[]> {
    const db = getDb();
    let sql  = `SELECT * FROM kg_nodes WHERE run_id = ?`;
    const params: unknown[] = [this.runId];

    if (query.where) {
      for (const [key, val] of Object.entries(query.where)) {
        if (key === 'type') { sql += ` AND node_type = ?`; params.push(val); }
        else if (key === 'label') { sql += ` AND label LIKE ?`; params.push(`%${val}%`); }
      }
    }
    if (query.limit) { sql += ` LIMIT ?`; params.push(query.limit); }

    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    db.close();
    return rows.map(r => this.rowToNode(r));
  }

  async updateNode(id: string, updates: Partial<GraphNode>): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (updates.label)      { sets.push('label = ?');      vals.push(updates.label); }
    if (updates.type)       { sets.push('node_type = ?');  vals.push(updates.type); }
    if (updates.properties) { sets.push('properties = ?'); vals.push(JSON.stringify(updates.properties)); }
    if (updates.embedding)  { sets.push('embedding = ?');  vals.push(serializeEmbedding(updates.embedding)); }
    if (sets.length === 0) return;

    sets.push('updated_at = datetime(\'now\')');
    vals.push(id, this.runId);
    const db = getDb();
    db.prepare(`UPDATE kg_nodes SET ${sets.join(', ')} WHERE id = ? AND run_id = ?`).run(...vals);
    db.close();
  }

  async deleteNode(id: string): Promise<void> {
    const db = getDb();
    db.prepare(`DELETE FROM kg_edges WHERE from_node_id = ? OR to_node_id = ?`).run(id, id);
    db.prepare(`DELETE FROM kg_nodes WHERE id = ? AND run_id = ?`).run(id, this.runId);
    db.close();
  }

  async createEdge(edge: Omit<GraphEdge, 'id'>): Promise<GraphEdge> {
    const id = `edge_${nanoid(8)}`;
    const db = getDb();
    db.prepare(`
      INSERT INTO kg_edges
        (id, run_id, from_node_id, to_node_id, relationship, properties, confidence, source_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, this.runId, edge.fromNodeId, edge.toNodeId,
      edge.relationship, JSON.stringify(edge.properties),
      edge.confidence ?? 0.5, (edge.properties.sourceText as string) ?? ''
    );
    db.close();
    return { id, ...edge };
  }

  async getEdge(id: string): Promise<GraphEdge | null> {
    const db  = getDb();
    const row = db.prepare(`SELECT * FROM kg_edges WHERE id = ? AND run_id = ?`).get(id, this.runId) as Record<string, unknown> | undefined;
    db.close();
    if (!row) return null;
    return this.rowToEdge(row);
  }

  async findEdges(query: GraphQuery): Promise<GraphEdge[]> {
    const db = getDb();
    let sql  = `SELECT * FROM kg_edges WHERE run_id = ?`;
    const params: unknown[] = [this.runId];
    if (query.where) {
      if (query.where.relationship) { sql += ` AND relationship = ?`; params.push(query.where.relationship); }
      if (query.where.fromNodeId) { sql += ` AND from_node_id = ?`; params.push(query.where.fromNodeId); }
      if (query.where.toNodeId) { sql += ` AND to_node_id = ?`; params.push(query.where.toNodeId); }
    }
    if (query.limit) { sql += ` LIMIT ?`; params.push(query.limit); }
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    db.close();
    return rows.map(r => this.rowToEdge(r));
  }

  async getEdgesFrom(nodeId: string): Promise<GraphEdge[]> { return this.findEdges({ where: { fromNodeId: nodeId } }); }
  async getEdgesTo(nodeId: string): Promise<GraphEdge[]> { return this.findEdges({ where: { toNodeId: nodeId } }); }

  async updateEdge(id: string, updates: Partial<GraphEdge>): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (updates.relationship) { sets.push('relationship = ?'); vals.push(updates.relationship); }
    if (updates.confidence !== undefined) { sets.push('confidence = ?'); vals.push(updates.confidence); }
    if (updates.properties) { sets.push('properties = ?'); vals.push(JSON.stringify(updates.properties)); }
    if (sets.length === 0) return;
    sets.push('updated_at = datetime(\'now\')');
    vals.push(id, this.runId);
    const db = getDb();
    db.prepare(`UPDATE kg_edges SET ${sets.join(', ')} WHERE id = ? AND run_id = ?`).run(...vals);
    db.close();
  }

  async deleteEdge(id: string): Promise<void> {
    const db = getDb();
    db.prepare(`DELETE FROM kg_edges WHERE id = ? AND run_id = ?`).run(id, this.runId);
    db.close();
  }

  async findPath(fromId: string, toId: string, maxHops = 3): Promise<GraphPath | null> {
    const visited = new Set<string>();
    const startNode = await this.getNode(fromId);
    if (!startNode) return null;
    const queue: { nodeId: string; path: GraphPath }[] = [{
      nodeId: fromId,
      path:   { nodes: [startNode], edges: [], length: 0 },
    }];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.nodeId === toId) return current.path;
      if (current.path.length >= maxHops) continue;
      if (visited.has(current.nodeId)) continue;
      visited.add(current.nodeId);
      const edges = await this.getEdgesFrom(current.nodeId);
      for (const edge of edges) {
        const nextNode = await this.getNode(edge.toNodeId);
        if (!nextNode || visited.has(edge.toNodeId)) continue;
        queue.push({
          nodeId: edge.toNodeId,
          path:   { nodes: [...current.path.nodes, nextNode], edges: [...current.path.edges, edge], length: current.path.length + 1 },
        });
      }
    }
    return null;
  }

  async findNeighbors(nodeId: string, hops = 1): Promise<GraphNode[]> {
    const visited = new Set<string>([nodeId]);
    let current = [nodeId];
    for (let h = 0; h < hops; h++) {
      const next: string[] = [];
      for (const id of current) {
        const edgesOut = await this.getEdgesFrom(id);
        const edgesIn = await this.getEdgesTo(id);
        for (const e of [...edgesOut, ...edgesIn]) {
          const nId = e.fromNodeId === id ? e.toNodeId : e.fromNodeId;
          if (!visited.has(nId)) { visited.add(nId); next.push(nId); }
        }
      }
      current = next;
    }
    visited.delete(nodeId);
    const nodes: GraphNode[] = [];
    for (const id of visited) { const node = await this.getNode(id); if (node) nodes.push(node); }
    return nodes;
  }

  async getStats(): Promise<GraphStats> {
    const db = getDb();
    const nodeCount = (db.prepare(`SELECT COUNT(*) as n FROM kg_nodes WHERE run_id = ?`).get(this.runId) as {n:number}).n;
    const edgeCount = (db.prepare(`SELECT COUNT(*) as n FROM kg_edges WHERE run_id = ?`).get(this.runId) as {n:number}).n;
    db.close();
    return {
      nodeCount, edgeCount, nodeTypes: {}, relationshipTypes: {},
      avgDegree: nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0,
      density: nodeCount > 1 ? (2 * edgeCount) / (nodeCount * (nodeCount - 1)) : 0,
      orphanNodes: 0,
    };
  }

  async clear(): Promise<void> {
    const db = getDb();
    db.prepare(`DELETE FROM kg_edges WHERE run_id = ?`).run(this.runId);
    db.prepare(`DELETE FROM kg_nodes WHERE run_id = ?`).run(this.runId);
    db.close();
  }

  async runRawQuery(query: string, params?: Record<string, unknown>): Promise<unknown> {
    const db = getDb();
    const res = db.prepare(query).all(...Object.values(params ?? {}));
    db.close(); return res;
  }

  private rowToNode(row: Record<string, unknown>): GraphNode {
    return { id: row.id as string, label: row.label as string, type: row.node_type as string, properties: JSON.parse(row.properties as string ?? '{}'), embedding: row.embedding ? deserializeEmbedding(row.embedding as Buffer) : undefined };
  }

  private rowToEdge(row: Record<string, unknown>): GraphEdge {
    return { id: row.id as string, fromNodeId: row.from_node_id as string, toNodeId: row.to_node_id as string, relationship: row.relationship as string, properties: JSON.parse(row.properties as string ?? '{}'), confidence: row.confidence as number ?? 0.5 };
  }

  private canonicalize(label: string): string { return label.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim(); }
}
