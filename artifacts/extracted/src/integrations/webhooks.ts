TypeScript

import { createHmac, timingSafeEqual } from 'node:crypto';
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export function verifyGitHubSignature(body: string, signature: string | null): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const hmac = createHmac('sha256', secret);
  const digest = `sha256=${hmac.update(body).digest('hex')}`;

  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function storeGitHubEvent(opts: {
  eventType: string;
  deliveryId?: string | null;
  action?: string | null;
  repoFullName?: string | null;
  payload: unknown;
}) {
  const db = getDb();
  db.prepare(`
    INSERT INTO github_events
      (id, event_type, repo_full_name, delivery_id, action, payload_json, processed)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(
    `ghe_${nanoid(8)}`,
    opts.eventType,
    opts.repoFullName ?? null,
    opts.deliveryId ?? null,
    opts.action ?? null,
    JSON.stringify(opts.payload)
  );
  db.close();
}
11. API routes for daemon / approvals / scheduler / webhooks
You can either fold these into src/api/server.ts or keep them as helpers.
Below are route snippets to add to handleRequest(...).

Add imports near top
TypeScript

import { ApprovalGate } from '@/runtime/approval-gate.js';
import { Scheduler } from '@/runtime/scheduler.js';
import { ServiceState } from '@/runtime/service-state.js';
import { verifyGitHubSignature, storeGitHubEvent } from '@/integrations/webhooks.js';
import { featureFlag } from '@/config/feature-flags.js';
Add route handlers inside handleRequest(...)
TypeScript

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

    // POST /api/jobs
    if (url.pathname === '/api/jobs' && method === 'POST') {
      const scheduler = new Scheduler();
      const body = await req.json() as {
        runId?: string;
        jobType: 'org_run' | 'dream' | 'graph_rebuild' | 'health_check' | 'github_sync';
        cronExpr: string;
        payload?: Record<string, unknown>;
      };
      const id = scheduler.createJob(body);
      return json({ ok: true, id });
    }

    // POST /api/webhooks/github
    if (url.pathname === '/api/webhooks/github' && method === 'POST') {
      if (!featureFlag('githubIntegration')) {
        return json({ error: 'githubIntegration disabled' }, 403);
      }

      const rawBody = await req.text();
      const sig = req.headers.get('x-hub-signature-256');
      const eventType = req.headers.get('x-github-event') ?? 'unknown';
      const deliveryId = req.headers.get('x-github-delivery');

      if (!verifyGitHubSignature(rawBody, sig)) {
        return json({ error: 'invalid signature' }, 401);
      }

      const payload = JSON.parse(rawBody);
      storeGitHubEvent({
        eventType,
        deliveryId,
        action: payload.action ?? null,
        repoFullName: payload.repository?.full_name ?? null,
        payload,
      });

      return json({ ok: true });
    }
12. Orchestrator Phase 5 integration
We don’t need to replace the entire orchestrator. We patch it to:

optionally use coordinator hierarchy
optionally trigger ULTRAPLAN on plateau
optionally require approval before commit
A. Add imports to src/runtime/orchestrator.ts
TypeScript

import { CoordinatorEngine } from './coordinator.js';
import { UltraPlanner } from './ultraplan.js';
import { ApprovalGate } from './approval-gate.js';
B. After run initialization, create engines
Add after const dreamEngine = new DreamEngine(runId);

TypeScript

  const coordinator = new CoordinatorEngine(runId);
  const ultraPlanner = new UltraPlanner(runId);
  const approvalGate = new ApprovalGate();
C. Before pipeline execution, allow coordinator hierarchy to create team tasks
Inside cycle loop, before const pipelineResult = await runCyclePipeline(...), add:

TypeScript

      if (featureFlag('coordinatorHierarchy')) {
        const sharedContext = await memoryManager.readIndex();
        await coordinator.assignTeamTasks(
          config,
          cycleNumber,
          `Advance mission toward score > ${runState.bestScore.toFixed(4)} while resolving open blockers.`,
          sharedContext.slice(0, 3000)
        );
      }
This lets department leads create delegated tasks even if your worker pipeline remains the same underneath.

D. Trigger ULTRAPLAN on plateau
After score is processed and before dream logic, add:

TypeScript

      if (
        featureFlag('ultraplan') &&
        runState.plateauCount >= Math.max(3, Math.floor(config.plateauCycles * 0.6))
      ) {
        const graphSummary = await memoryManager.semanticSearch('strategic bottlenecks plateau blockers', 8);
        const objectionsSummary = JSON.stringify(objectionTracker.getStats());
        const memorySummary = (await memoryManager.readIndex()).slice(0, 2500);

        const ultra = await ultraPlanner.run({
          config,
          cycleNumber,
          currentBest: runState.bestScore,
          plateauCount: runState.plateauCount,
          mission: config.mission,
          memorySummary,
          objectionsSummary,
          graphSummary,
          triggerReason: 'plateau',
        });

        const approvalId = approvalGate.request({
          runId,
          cycleNumber,
          approvalType: 'ultraplan',
          subject: ultra.sessionId,
          requestedBy: 'CEO',
          summary: `ULTRAPLAN proposes a strategic pivot with ${ultra.result.five_cycle_plan.length} future steps.`,
          details: ultra.result,
        });

        eventBus.broadcast({
          type: 'ultraplan_ready',
          sessionId: ultra.sessionId,
          approvalId,
          result: ultra.result,
        });
      }
E. Require approval before commit if feature flag enabled
Find the block where commit happens. Before treating a COMMIT as final, add:

TypeScript

      if (ratchetResult.decision === 'COMMIT' && featureFlag('approvalGates')) {
        const approvalId = approvalGate.request({
          runId,
          cycleNumber,
          approvalType: 'commit',
          subject: ratchetResult.commitHash ?? `cycle_${cycleNumber}`,
          requestedBy: 'system',
          summary: `Cycle ${cycleNumber} wants to commit score ${score.composite.toFixed(4)}.`,
          details: {
            score,
            justification: score.justification,
            commitHash: ratchetResult.commitHash ?? null,
          },
        });

        eventBus.broadcast({
          type: 'approval_requested',
          approvalId,
          approvalType: 'commit',
          cycleNumber,
        });

        // Phase 5 behavior: mark as pending human gate
        // keep commit in git locally, but do not count it as final organizational approval
      }
If you want strict blocking, then instead of allowing it immediately, you can downgrade decision until approved.
For now this is “soft gate with pending approval”. If you want strict blocking, I can give that next.

13. Dashboard approvals page