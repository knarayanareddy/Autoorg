import { getDb } from '@/db/migrate.js';
import { BenchmarkRunner } from '@/evals/benchmark-runner.js';
import { ReplayLab } from '@/evals/replay-lab.js';
import { ConstitutionAB } from '@/evals/constitution-ab.js';
import { LeaderboardService } from '@/evals/leaderboard.js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handleEvalRoutes(url: URL, req: Request) {
  const method = req.method;

  // GET /api/benchmarks — List benchmark runs
  if (url.pathname === '/api/benchmarks' && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`
      SELECT br.*, bs.suite_name
      FROM benchmark_runs br
      JOIN benchmark_suites bs ON bs.id = br.suite_id
      ORDER BY br.started_at DESC
      LIMIT 100
    `).all();
    db.close();
    return json(rows);
  }

  // POST /api/benchmarks/run — Trigger a benchmark suite
  if (url.pathname === '/api/benchmarks/run' && method === 'POST') {
    const body = await req.json() as any;
    const runner = new BenchmarkRunner();
    // Non-blocking run
    runner.runSuite(body).catch(err => console.error('Benchmark suite failed:', err));
    return json({ ok: true, message: 'Benchmark suite started in background.' });
  }

  // GET /api/leaderboards — Model/Template rankings
  if (url.pathname === '/api/leaderboards' && method === 'GET') {
    const suiteName = url.searchParams.get('suite');
    const type = url.searchParams.get('type');
    const db = getDb();
    const rows = db.prepare(`
      SELECT lb.*, bs.suite_name
      FROM leaderboards lb
      JOIN benchmark_suites bs ON bs.id = lb.suite_id
      WHERE (? IS NULL OR bs.suite_name = ?)
        AND (? IS NULL OR lb.leaderboard_type = ?)
      ORDER BY lb.pass_rate DESC, lb.average_score DESC
    `).all(suiteName, suiteName, type, type);
    db.close();
    return json(rows);
  }

  // POST /api/replay — Replay a benchmark attempt
  if (url.pathname === '/api/replay' && method === 'POST') {
    const body = await req.json() as { attemptId: string; mode?: any };
    const lab = new ReplayLab();
    const result = await lab.replayAttempt(body);
    return json({ ok: true, result });
  }

  // POST /api/constitution-ab — Compare constitutions
  if (url.pathname === '/api/constitution-ab' && method === 'POST') {
    const body = await req.json() as any;
    const ab = new ConstitutionAB();
    const result = await ab.compare(body);
    return json({ ok: true, result });
  }

  return null;
}
