import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('runId');

  if (!runId) {
    return NextResponse.json({ error: 'runId is required' }, { status: 400 });
  }

  // Next.js runs in /web, DB is in /
  const dbPath = process.env.AUTOORG_DB_PATH || path.join(process.cwd(), '..', 'autoorg.db');
  
  try {
    const db = new Database(dbPath);
    
    const nodes = db.prepare(`
      SELECT id, label, node_type as type, properties as propertiesJson 
      FROM kg_nodes 
      WHERE run_id = ?
    `).all(runId) as any[];

    const edges = db.prepare(`
      SELECT id, from_node_id as source, to_node_id as target, relationship as type, confidence 
      FROM kg_edges 
      WHERE run_id = ?
    `).all(runId) as any[];

    db.close();

    return NextResponse.json({
      nodes: nodes.map(n => ({
        id: n.id,
        label: n.label,
        type: n.type,
        properties: JSON.parse(n.propertiesJson || '{}')
      })),
      links: edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type,
        confidence: e.confidence
      }))
    });
  } catch (err) {
    console.error('Failed to fetch graph data:', err);
    return NextResponse.json({ error: 'Failed to fetch graph data' }, { status: 500 });
  }
}
