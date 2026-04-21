/**
 * AutoOrg API Server
 * Serves the Next.js dashboard data and WebSocket events.
 *
 * Endpoints:
 *   GET  /api/runs              → all runs
 *   GET  /api/runs/:id          → run detail + summary
 *   GET  /api/runs/:id/cycles   → all cycles for run
 *   GET  /api/runs/:id/cycles/:n → cycle detail + agent executions
 *   GET  /api/runs/:id/objections → all objections
 *   GET  /api/runs/:id/mailbox  → mailbox messages
 *   GET  /api/runs/:id/cost     → cost breakdown by agent
 *   GET  /api/runs/:id/scores   → score history (for chart)
 *   GET  /api/flags             → feature flags
 *   POST /api/interview         → start agent interview session
 *   POST /api/interview/:id     → send a message to an agent
 *   WS   /ws                   → live event stream
 *
 * Run: bun run src/api/server.ts
 */

import { eventBus }      from '@/runtime/event-bus.js';
import { config as dotenvLoad } from 'dotenv';
import {
  getAllRuns, getRun, getCyclesForRun,
  getScoreHistory, getCostBreakdownByRole,
  getOpenObjections, getAllObjections,
  getMailboxForCycle, getAgentExecutionsForCycle,
  getDashboardSummary, getFeatureFlags,
  getKnowledgeGraph,
} from '@/db/queries.js';
import { registerRoute, matchRoute, json, notFound, serverError } from './route-utils.js';
import { getDb } from '@/db/migrate.js';
import { ApprovalGate } from '@/runtime/approval-gate.js';
import { ServiceState } from '@/runtime/service-state.js';
import { verifyGitHubSignature, storeGitHubEvent } from '@/integrations/webhooks.js';
import { featureFlag } from '@/config/feature-flags.js';
import chalk from 'chalk';
import { handleEvalRoutes } from './eval-routes.js';
import { handlePortfolioRoutes } from './portfolio-routes.js';
import { handlePivotRoutes } from './pivot-routes.js';
import { handleSwarmRoutes } from './swarm-routes.js';
import { handlePlatformRoutes } from './platform-routes.js';
import { handleLearningRoutes } from './learning-routes.js';

dotenvLoad();

const PORT = parseInt(process.env.API_PORT ?? '3001');

// ── CORS headers ────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json',
};

// ── Request handler ────────────────────────────────────────────────────
async function handleRequest(req: Request): Promise<Response> {
  const url    = new URL(req.url);
  const method = req.method;

  if (method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    // Phase 7: Eval/Benchmark routes
    const evalResponse = await handleEvalRoutes(url, req);
    if (evalResponse) return evalResponse;

    // Phase 8: Portfolio routes
    const portfolioResponse = await handlePortfolioRoutes(url, req);
    if (portfolioResponse) return portfolioResponse;

    // Phase 9: Pivot/Objective routes
    const pivotResponse = await handlePivotRoutes(url, req);
    if (pivotResponse) return pivotResponse;

    // Phase 10: Swarm routes
    const swarmResponse = await handleSwarmRoutes(url, req);
    if (swarmResponse) return swarmResponse;

    // Phase 11: Platform routes
    const platformResponse = await handlePlatformRoutes(url, req);
    if (platformResponse) return platformResponse;

    // Phase 12: Learning routes
    const learningResponse = await handleLearningRoutes(url, req);
    if (learningResponse) return learningResponse;

    // GET /api/health (Enterprise-tier health check)
    if (url.pathname === '/api/health' || url.pathname === '/health') {
      const db = getDb();
      let dbOk = false;
      try {
        db.prepare('SELECT 1').get();
        dbOk = true;
      } catch (err) {
        console.error(chalk.red(`[Health] DB Error: ${err}`));
      }
      db.close();

      const status = dbOk ? 200 : 503;
      return json({
        ok:      dbOk,
        db:      dbOk ? 'ok' : 'error',
        clients: eventBus.clientCount,
        version: process.env.AUTOORG_VERSION ?? '0.1.0-dev',
        ts:      new Date().toISOString(),
      }, { status });
    }

    // GET /api/flags
    if (url.pathname === '/api/flags') {
      return json(getFeatureFlags());
    }

    // GET /api/runs
    if (url.pathname === '/api/runs' && method === 'GET') {
      return json(getAllRuns());
    }

    // GET /api/runs/:id
    let params = matchRoute(url, method, '/api/runs/:id', 'GET');
    if (params) {
      const summary = getDashboardSummary(params.id!);
      return summary ? json(summary) : notFound(`Run ${params.id} not found`);
    }

    // GET /api/runs/:id/scores
    params = matchRoute(url, method, '/api/runs/:id/scores', 'GET');
    if (params) {
      return json(getScoreHistory(params.id!));
    }

    // GET /api/runs/:id/cycles
    params = matchRoute(url, method, '/api/runs/:id/cycles', 'GET');
    if (params) {
      return json(getCyclesForRun(params.id!));
    }

    // GET /api/runs/:id/cost (and /costs)
    params = matchRoute(url, method, '/api/runs/:id/cost', 'GET') || matchRoute(url, method, '/api/runs/:id/costs', 'GET');
    if (params) {
      return json(getCostBreakdownByRole(params.id!));
    }

    // GET /api/runs/:id/graph
    params = matchRoute(url, method, '/api/runs/:id/graph', 'GET');
    if (params) {
      return json(getKnowledgeGraph(params.id!));
    }

    // GET /api/runs/:id/objections
    params = matchRoute(url, method, '/api/runs/:id/objections', 'GET');
    if (params) {
      const openOnly = url.searchParams.get('open') === 'true';
      return json(openOnly ? getOpenObjections(params.id!) : getAllObjections(params.id!));
    }

    // GET /api/runs/:runId/cycles/:cycleId
    params = matchRoute(url, method, '/api/runs/:runId/cycles/:cycleId', 'GET');
    if (params) {
      const executions = getAgentExecutionsForCycle(params.cycleId!);
      const mailbox    = getMailboxForCycle(params.cycleId!);
      return json({ executions, mailbox });
    }

    // GET /api/events/:runId (recent events for dashboard initial load)
    params = matchRoute(url, method, '/api/events/:runId', 'GET');
    if (params) {
      const limit  = parseInt(url.searchParams.get('limit') ?? '100');
      const events = eventBus.getRecentEvents(params.runId!, limit);
      return json({ events });
    }

    // --- PHASE 5: DAEMON & APPROVALS ---

    // GET /api/daemon
    if (url.pathname === '/api/daemon' && method === 'GET') {
      const state = new ServiceState();
      return json(state.get());
    }

    // GET /api/approvals
    if (url.pathname === '/api/approvals' && method === 'GET') {
      const gate = new ApprovalGate();
      return json(gate.getPending(url.searchParams.get('runId') ?? undefined));
    }

    // POST /api/approvals/:id/approve
    params = matchRoute(url, method, '/api/approvals/:id/approve', 'POST');
    if (params) {
      const gate = new ApprovalGate();
      gate.approve(params.id!, 'human_api');
      return json({ ok: true, id: params.id, status: 'approved' });
    }

    // POST /api/approvals/:id/reject
    params = matchRoute(url, method, '/api/approvals/:id/reject', 'POST');
    if (params) {
      const gate = new ApprovalGate();
      gate.reject(params.id!, 'human_api');
      return json({ ok: true, id: params.id, status: 'rejected' });
    }

    // POST /api/webhooks/github
    if (url.pathname === '/api/webhooks/github' && method === 'POST') {
      if (!featureFlag('githubIntegration')) {
        return json({ error: 'GitHub integration disabled' }, { status: 403 });
      }

      const body = await req.text();
      const signature = req.headers.get('x-hub-signature-256');
      
      if (!verifyGitHubSignature(body, signature)) {
        return json({ error: 'Invalid signature' }, { status: 401 });
      }

      const event = req.headers.get('x-github-event') || 'unknown';
      const payload = JSON.parse(body);

      storeGitHubEvent({
        eventType: event,
        deliveryId: req.headers.get('x-github-delivery'),
        action: payload.action,
        repoFullName: payload.repository?.full_name,
        payload
      });

      return json({ ok: true });
    }

    // GET /api/tools/executions
    if (url.pathname === '/api/tools/executions' && method === 'GET') {
      const runId = url.searchParams.get('runId');
      const db = getDb();
      const traces = db.prepare(`
        SELECT * FROM tool_executions
        WHERE (? IS NULL OR run_id = ?)
        ORDER BY created_at DESC
        LIMIT 50
      `).all(runId ?? null, runId ?? null);
      db.close();
      return json(traces);
    }

    // GET /api/security/findings
    if (url.pathname === '/api/security/findings' && method === 'GET') {
      const runId = url.searchParams.get('runId');
      const db = getDb();
      const findings = db.prepare(`
        SELECT * FROM security_findings
        WHERE (? IS NULL OR run_id = ?)
        ORDER BY created_at DESC
        LIMIT 50
      `).all(runId ?? null, runId ?? null);
      db.close();
      return json(findings);
    }

    // POST /api/interview — Start an agent interview
    if (url.pathname === '/api/interview' && method === 'POST') {
      const body = await req.json() as {
        runId:     string;
        agentRole: string;
        cycleId?:  string;
        question:  string;
      };

      const { InterviewEngine } = await import('@/runtime/interview.js');
      const engine   = new InterviewEngine(body.runId);
      const response = await engine.startInterview(body.agentRole, body.cycleId, body.question);

      return json(response);
    }

    // POST /api/interview/:sessionId — Continue an interview
    params = matchRoute(url, method, '/api/interview/:sessionId', 'POST');
    if (params) {
      const body = await req.json() as { message: string };
      const { InterviewEngine } = await import('@/runtime/interview.js');

      // Load session from DB
      const db      = (await import('@/db/migrate.js')).getDb();
      const session = db.prepare(`
        SELECT * FROM interview_sessions WHERE id = ?
      `).get(params.sessionId!) as { run_id: string; turns: string } | undefined;
      db.close();

      if (!session) return notFound(`Session ${params.sessionId} not found`);

      const engine   = new InterviewEngine(session.run_id);
      const response = await engine.continueInterview(params.sessionId!, body.message);

      return json(response);
    }

    return notFound();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`[API] Error: ${msg}`));
    return serverError(msg);
  }
}

// ── Bun server with WebSocket support ─────────────────────────────────
const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    // Upgrade WebSocket connections
    if (req.headers.get('upgrade') === 'websocket') {
      const success = server.upgrade(req);
      return success ? undefined : new Response('WebSocket upgrade failed', { status: 400 });
    }
    return handleRequest(req);
  },
  websocket: {
    open(ws) {
      eventBus.addClient(ws as unknown as { send: (d: string) => void; readyState: number });
      // Send recent events on connect so dashboard catches up
      ws.send(JSON.stringify({ type: 'connected', message: 'AutoOrg API connected' }));
    },
    message(ws, message) {
      // Clients can send { type: 'ping' } or { type: 'subscribe', runId: '...' }
      try {
        const parsed = JSON.parse(String(message)) as { type: string };
        if (parsed.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch { /* ignore malformed messages */ }
    },
    close(ws) {
      eventBus.removeClient(ws as unknown as { send: (d: string) => void; readyState: number });
    },
  },
});

console.log(chalk.bold.cyan(`\n🌐 AutoOrg API Server`));
console.log(chalk.white(`   HTTP:      http://localhost:${PORT}/api`));
console.log(chalk.white(`   WebSocket: ws://localhost:${PORT}/ws`));
console.log(chalk.gray(`   Press Ctrl+C to stop\n`));

export { server };
