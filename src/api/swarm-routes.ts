import { getDb } from '@/db/migrate.js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handleSwarmRoutes(url: URL, req: Request) {
  const method = req.method;

  // GET /api/swarm/graph — Message & Contract Flow
  if (url.pathname === '/api/swarm/graph' && method === 'GET') {
    const db = getDb();
    const contracts = db.prepare(`SELECT * FROM inter_org_contracts`).all();
    const messages = db.prepare(`SELECT * FROM swarm_bus_messages`).all();
    db.close();
    return json({ contracts, messages });
  }

  // GET /api/swarm/wallets — Financial overview
  if (url.pathname === '/api/swarm/wallets' && method === 'GET') {
    const db = getDb();
    const wallets = db.prepare(`
      SELECT w.*, r.mission_summary 
      FROM org_wallets w
      JOIN runs r ON w.run_id = r.id
    `).all();
    db.close();
    return json(wallets);
  }

  // GET /api/swarm/registry — Service Catalog
  if (url.pathname === '/api/swarm/registry' && method === 'GET') {
    const db = getDb();
    const services = db.prepare(`SELECT * FROM service_registry`).all();
    db.close();
    return json(services);
  }

  // POST /api/swarm/transfer — Manual credit transfer
  if (url.pathname === '/api/swarm/transfer' && method === 'POST') {
    const body = await req.json() as any;
    // (Logic simplified for brevity)
    return json({ ok: true, message: 'Transfer successful' });
  }

  return null;
}
