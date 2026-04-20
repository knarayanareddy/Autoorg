TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export async function snapshotGraphState(
  runId: string,
  buildId: string,
  label: string
): Promise<string> {
  const snapshotId = `gs_${nanoid(8)}`;
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

  db.prepare(`
    INSERT INTO graph_snapshots (id, run_id, build_id, label, node_count, edge_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(snapshotId, runId, buildId, label, nodes.length, edges.length);

  const nodeStmt = db.prepare(`
    INSERT INTO graph_snapshot_nodes (snapshot_id, node_id, label, node_type, properties_json)
    VALUES (?, ?, ?, ?, ?)
  `);

  const edgeStmt = db.prepare(`
    INSERT INTO graph_snapshot_edges (snapshot_id, edge_id, from_node_id, to_node_id, rel_type, weight, properties_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const n of nodes) {
      nodeStmt.run(snapshotId, n.node_id, n.label, n.node_type, n.properties_json);
    }
    for (const e of edges) {
      edgeStmt.run(snapshotId, e.id, e.from_node_id, e.to_node_id, e.rel_type, e.weight, e.properties_json);
    }
  });

  tx();
  db.close();

  return snapshotId;
}

export function listGraphSnapshots(runId: string): Array<{
  id: string;
  build_id: string;
  label: string;
  node_count: number;
  edge_count: number;
  created_at: string;
}> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, build_id, label, node_count, edge_count, created_at
    FROM graph_snapshots
    WHERE run_id = ?
    ORDER BY created_at DESC
  `).all(runId) as Array<{
    id: string;
    build_id: string;
    label: string;
    node_count: number;
    edge_count: number;
    created_at: string;
  }>;
  db.close();
  return rows;
}

export function diffGraphSnapshots(
  beforeSnapshotId: string,
  afterSnapshotId: string
): {
  addedNodes: Array<{ node_id: string; label: string; node_type: string }>;
  removedNodes: Array<{ node_id: string; label: string; node_type: string }>;
  addedEdges: Array<{ edge_id: string; from_node_id: string; to_node_id: string; rel_type: string }>;
  removedEdges: Array<{ edge_id: string; from_node_id: string; to_node_id: string; rel_type: string }>;
} {
  const db = getDb();

  const beforeNodes = db.prepare(`
    SELECT node_id, label, node_type FROM graph_snapshot_nodes WHERE snapshot_id = ?
  `).all(beforeSnapshotId) as Array<{ node_id: string; label: string; node_type: string }>;

  const afterNodes = db.prepare(`
    SELECT node_id, label, node_type FROM graph_snapshot_nodes WHERE snapshot_id = ?
  `).all(afterSnapshotId) as Array<{ node_id: string; label: string; node_type: string }>;

  const beforeEdges = db.prepare(`
    SELECT edge_id, from_node_id, to_node_id, rel_type FROM graph_snapshot_edges WHERE snapshot_id = ?
  `).all(beforeSnapshotId) as Array<{ edge_id: string; from_node_id: string; to_node_id: string; rel_type: string }>;

  const afterEdges = db.prepare(`
    SELECT edge_id, from_node_id, to_node_id, rel_type FROM graph_snapshot_edges WHERE snapshot_id = ?
  `).all(afterSnapshotId) as Array<{ edge_id: string; from_node_id: string; to_node_id: string; rel_type: string }>;

  db.close();

  const beforeNodeMap = new Map(beforeNodes.map(n => [n.node_id, n]));
  const afterNodeMap = new Map(afterNodes.map(n => [n.node_id, n]));
  const beforeEdgeMap = new Map(beforeEdges.map(e => [e.edge_id, e]));
  const afterEdgeMap = new Map(afterEdges.map(e => [e.edge_id, e]));

  const addedNodes = afterNodes.filter(n => !beforeNodeMap.has(n.node_id));
  const removedNodes = beforeNodes.filter(n => !afterNodeMap.has(n.node_id));
  const addedEdges = afterEdges.filter(e => !beforeEdgeMap.has(e.edge_id));
  const removedEdges = beforeEdges.filter(e => !afterEdgeMap.has(e.edge_id));

  return {
    addedNodes,
    removedNodes,
    addedEdges,
    removedEdges,
  };
}
4. Graph export