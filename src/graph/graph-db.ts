/**
 * AutoOrg — Graph Database Abstraction Layer
 *
 * Dual backend strategy: Neo4j (prod), Kuzu (embedded), SQLite (fallback).
 */

export interface GraphNode {
  id:         string;
  label:      string;
  type:       string;
  properties: Record<string, unknown>;
  embedding?: number[];
}

export interface GraphEdge {
  id:           string;
  fromNodeId:   string;
  toNodeId:     string;
  relationship: string;
  properties:   Record<string, unknown>;
  confidence:   number;
}

export interface GraphPath {
  nodes: GraphNode[];
  edges: GraphEdge[];
  length: number;
}

export interface GraphQuery {
  match?:  string;
  where?:  Record<string, unknown>;
  return?: string[];
  limit?:  number;
}

export interface GraphStats {
  nodeCount:          number;
  edgeCount:          number;
  nodeTypes:          Record<string, number>;
  relationshipTypes:  Record<string, number>;
  avgDegree:          number;
  density:            number;
  orphanNodes:        number;
}

export interface GraphDatabase {
  readonly backend: 'neo4j' | 'kuzu' | 'sqlite';

  connect():    Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  createNode(node: Omit<GraphNode, 'id'>): Promise<GraphNode>;
  getNode(id: string):                      Promise<GraphNode | null>;
  getNodeByLabel(label: string):            Promise<GraphNode | null>;
  findNodes(query: GraphQuery):             Promise<GraphNode[]>;
  updateNode(id: string, updates: Partial<GraphNode>): Promise<void>;
  deleteNode(id: string):                   Promise<void>;

  createEdge(edge: Omit<GraphEdge, 'id'>): Promise<GraphEdge>;
  getEdge(id: string):                      Promise<GraphEdge | null>;
  findEdges(query: GraphQuery):             Promise<GraphEdge[]>;
  getEdgesFrom(nodeId: string):             Promise<GraphEdge[]>;
  getEdgesTo(nodeId: string):               Promise<GraphEdge[]>;
  updateEdge(id: string, updates: Partial<GraphEdge>): Promise<void>;
  deleteEdge(id: string):                   Promise<void>;

  findPath(fromId: string, toId: string, maxHops?: number): Promise<GraphPath | null>;
  findNeighbors(nodeId: string, hops?: number):             Promise<GraphNode[]>;
  getStats():                 Promise<GraphStats>;
  clear():                    Promise<void>;
  
  runRawQuery(query: string, params?: Record<string, unknown>): Promise<unknown>;
}

export async function createGraphDatabase(
  runId:   string,
  backend: 'neo4j' | 'kuzu' | 'sqlite' = 'sqlite'
): Promise<GraphDatabase> {
  switch (backend) {
    case 'sqlite':
    default: {
      const { SQLiteGraphDB } = await import('./sqlite-graph-adapter.js');
      return new SQLiteGraphDB(runId);
    }
  }
}

export async function createBestAvailableGraphDB(runId: string): Promise<GraphDatabase> {
  // Simple fallback for now
  const db = await createGraphDatabase(runId, 'sqlite');
  await db.connect();
  return db;
}
