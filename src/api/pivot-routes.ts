import { getDb } from '@/db/migrate.js';
import { PivotEngine } from '@/runtime/pivot-engine.js';
import { ObjectiveOptimizer } from '@/evals/objective-optimizer.js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handlePivotRoutes(url: URL, req: Request) {
  const method = req.method;

  // GET /api/runs/:runId/pivots — List pivots
  if (url.pathname.startsWith('/api/runs/') && url.pathname.endsWith('/pivots') && method === 'GET') {
    const runId = url.pathname.split('/')[3];
    const db = getDb();
    const rows = db.prepare(`SELECT * FROM strategic_pivots WHERE run_id = ? ORDER BY created_at DESC`).all(runId);
    db.close();
    return json(rows);
  }

  // POST /api/pivots/:id/approve — Approve a pivot
  if (url.pathname.startsWith('/api/pivots/') && url.pathname.endsWith('/approve') && method === 'POST') {
    const pivotId = url.pathname.split('/')[3];
    const db = getDb();
    const pivot = db.prepare(`SELECT run_id FROM strategic_pivots WHERE id = ?`).get(pivotId) as any;
    db.close();
    
    if (!pivot) return json({ error: 'Pivot not found' }, 404);

    const engine = new PivotEngine(pivot.run_id);
    await engine.applyPivot(pivotId);
    return json({ ok: true, message: 'Pivot approved and applied.' });
  }

  // GET /api/runs/:runId/debt — Process Debt Reports
  if (url.pathname.startsWith('/api/runs/') && url.pathname.endsWith('/debt') && method === 'GET') {
    const runId = url.pathname.split('/')[3];
    const db = getDb();
    const rows = db.prepare(`SELECT * FROM reflection_reports WHERE run_id = ? ORDER BY created_at DESC`).all(runId);
    db.close();
    return json(rows);
  }

  // POST /api/runs/:runId/objectives — Update objectives live
  if (url.pathname.startsWith('/api/runs/') && url.pathname.endsWith('/objectives') && method === 'POST') {
    const runId = url.pathname.split('/')[3];
    const body = await req.json() as any;
    const optimizer = new ObjectiveOptimizer(runId);
    await optimizer.setObjectives({
      quality: body.quality ?? 1.0,
      cost: body.cost ?? 1.0,
      speed: body.speed ?? 1.0,
    });
    return json({ ok: true, message: 'Objectives updated mid-run.' });
  }

  return null;
}
