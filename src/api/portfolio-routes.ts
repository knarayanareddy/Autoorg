import { getDb } from '@/db/migrate.js';
import { PortfolioRunner } from '@/portfolio/portfolio-runner.js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handlePortfolioRoutes(url: URL, req: Request) {
  const method = req.method;

  // GET /api/portfolio/runs — List portfolio executions
  if (url.pathname === '/api/portfolio/runs' && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM portfolio_runs
      ORDER BY created_at DESC
      LIMIT 100
    `).all();
    db.close();
    return json(rows);
  }

  // GET /api/portfolio/runs/:id — Run detail with variants
  if (url.pathname.startsWith('/api/portfolio/runs/') && method === 'GET') {
    const id = url.pathname.split('/').pop()!;
    const db = getDb();
    const run = db.prepare(`SELECT * FROM portfolio_runs WHERE id = ?`).get(id);
    if (!run) { db.close(); return null; }

    const variants = db.prepare(`SELECT * FROM portfolio_variants WHERE portfolio_run_id = ?`).all(id);
    const rounds = db.prepare(`SELECT * FROM portfolio_rounds WHERE portfolio_run_id = ?`).all(id);
    const allocations = db.prepare(`SELECT * FROM portfolio_allocations WHERE portfolio_run_id = ?`).all(id);
    
    db.close();
    return json({ run, variants, rounds, allocations });
  }

  // POST /api/portfolio/run — Start a new portfolio mission
  if (url.pathname === '/api/portfolio/run' && method === 'POST') {
    const body = await req.json() as any;
    const runner = new PortfolioRunner();
    runner.runMission(body).catch(err => console.error('Portfolio mission failed:', err));
    return json({ ok: true, message: 'Portfolio mission started.' });
  }

  return null;
}
