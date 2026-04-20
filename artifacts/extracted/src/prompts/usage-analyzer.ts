TypeScript

import { z } from 'zod';

export const UsageAnalyzerSchema = z.object({
  anomalies: z.array(z.string()).max(10),
  likely_causes: z.array(z.string()).max(10),
  suggested_actions: z.array(z.string()).max(10),
});

export const USAGE_ANALYZER_SYSTEM_PROMPT = `
You analyze AutoOrg platform usage and spending anomalies.

Look for:
- sudden cost spikes,
- quota exhaustion,
- abnormal benchmark activity,
- suspicious agent churn,
- storage growth.

Hard rules:
- Be conservative.
- Call out likely legitimate causes if supported by context.
`.trim();
30. Minimal UI additions
text

web/app/
├── auth/page.tsx
├── workspaces/page.tsx
├── runs/page.tsx
├── templates/page.tsx
├── billing/page.tsx
├── agents/page.tsx
├── admin/page.tsx
├── compliance/page.tsx
└── comments/page.tsx
Patch nav in web/app/layout.tsx
React

<nav className="ml-auto flex gap-6 text-sm">
  <a href="/" className="text-gray-400 hover:text-cyan-400 transition-colors">Dashboard</a>
  <a href="/graph" className="text-gray-400 hover:text-cyan-400 transition-colors">Graph</a>
  <a href="/approvals" className="text-gray-400 hover:text-cyan-400 transition-colors">Approvals</a>
  <a href="/budgets" className="text-gray-400 hover:text-cyan-400 transition-colors">Budgets</a>
  <a href="/locks" className="text-gray-400 hover:text-cyan-400 transition-colors">Locks</a>
  <a href="/issues" className="text-gray-400 hover:text-cyan-400 transition-colors">Issues</a>
  <a href="/tools" className="text-gray-400 hover:text-cyan-400 transition-colors">Tools</a>
  <a href="/evidence" className="text-gray-400 hover:text-cyan-400 transition-colors">Evidence</a>
  <a href="/ledger" className="text-gray-400 hover:text-cyan-400 transition-colors">Ledger</a>
  <a href="/provenance" className="text-gray-400 hover:text-cyan-400 transition-colors">Provenance</a>
  <a href="/security" className="text-gray-400 hover:text-cyan-400 transition-colors">Security</a>
  <a href="/benchmarks" className="text-gray-400 hover:text-cyan-400 transition-colors">Benchmarks</a>
  <a href="/leaderboard" className="text-gray-400 hover:text-cyan-400 transition-colors">Leaderboard</a>
  <a href="/regressions" className="text-gray-400 hover:text-cyan-400 transition-colors">Regressions</a>
  <a href="/replay" className="text-gray-400 hover:text-cyan-400 transition-colors">Replay</a>
  <a href="/portfolio" className="text-gray-400 hover:text-cyan-400 transition-colors">Portfolio</a>
  <a href="/capital" className="text-gray-400 hover:text-cyan-400 transition-colors">Capital</a>
  <a href="/council" className="text-gray-400 hover:text-cyan-400 transition-colors">Council</a>
  <a href="/tournament" className="text-gray-400 hover:text-cyan-400 transition-colors">Tournament</a>
  <a href="/exchanges" className="text-gray-400 hover:text-cyan-400 transition-colors">Exchanges</a>
  <a href="/workspaces" className="text-gray-400 hover:text-cyan-400 transition-colors">Workspaces</a>
  <a href="/runs" className="text-gray-400 hover:text-cyan-400 transition-colors">Runs</a>
  <a href="/templates" className="text-gray-400 hover:text-cyan-400 transition-colors">Templates</a>
  <a href="/billing" className="text-gray-400 hover:text-cyan-400 transition-colors">Billing</a>
  <a href="/agents" className="text-gray-400 hover:text-cyan-400 transition-colors">Agents</a>
  <a href="/comments" className="text-gray-400 hover:text-cyan-400 transition-colors">Comments</a>
  <a href="/compliance" className="text-gray-400 hover:text-cyan-400 transition-colors">Compliance</a>
  <a href="/admin" className="text-gray-400 hover:text-cyan-400 transition-colors">Admin</a>
</nav>
/workspaces
Show:

tenant workspaces,
isolation mode,
repo URL,
active status,
create workspace button.
/runs
Show:

hosted runs queue,
mode,
assigned agent,
status,
output/report links.
/templates
Show:

template marketplace,
role packs,
publish template button.
/billing
Show:

current spend,
event table,
quota bars,
per-workspace cost.
/agents
Show:

remote agents,
deployment mode,
heartbeat,
status,
claimed work.
/comments
Show:

comment threads attached to runs/approvals/artifacts.
/compliance
Show:

compliance logs,
retention actions,
backup/export jobs.
/admin
Show:

platform metrics,
tenant metrics,
inflight runs,
online agents,
total billed,
recent failures.
31. Compliance logs integration
When key platform actions happen, write compliance logs.

Examples:

auth login
workspace create
hosted run submit
approval action
template publish
backup export
retention purge
permission denied
You can centralize this in a helper later, but the minimum pattern is:

TypeScript

db.prepare(`
  INSERT INTO compliance_logs
  (id, tenant_id, workspace_id, actor_type, actor_ref, event_type, subject_kind, subject_ref, details_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  `cl_${nanoid(10)}`,
  tenantId,
  workspaceId ?? null,
  'user',
  userId,
  'run_submitted',
  'hosted_run',
  hostedRunId,
  JSON.stringify({ mode })
);
That keeps platform activity auditable in the same spirit as your earlier action ledger.

32. Tests for Phase 9
tests/auth.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { AuthService } from '../src/platform/auth.js';

describe('AuthService', () => {
  it('creates user, tenant, and session', () => {
    const auth = new AuthService();
    const user = auth.createUser({
      email: `u${Date.now()}@example.com`,
      displayName: 'Test User',
      password: 'secret123',
    });

    const tenant = auth.createTenant({
      slug: `tenant-${Date.now()}`,
      displayName: 'Tenant',
      ownerUserId: user.userId,
    });

    const session = auth.login({
      email: user.userId ? `u${Date.now()}@example.com` : '',
      password: 'secret123',
    });

    expect(user.userId.startsWith('usr_')).toBe(true);
    expect(tenant.tenantId.startsWith('ten_')).toBe(true);
    // login path may need controlled email in real test fixture
  });
});
tests/rbac.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { RbacService } from '../src/platform/rbac.js';

describe('RbacService', () => {
  it('exposes a permission checker', () => {
    const rbac = new RbacService();
    expect(typeof rbac.hasPermission).toBe('function');
  });
});
tests/workspace-provisioner.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { WorkspaceProvisioner } from '../src/platform/workspace-provisioner.js';

describe('WorkspaceProvisioner', () => {
  it('creates a workspace root', async () => {
    const p = new WorkspaceProvisioner();
    const result = await p.create({
      tenantId: 'ten_test',
      slug: `ws-${Date.now()}`,
      displayName: 'WS Test',
    });

    expect(result.workspaceId.startsWith('ws_')).toBe(true);
    expect(result.rootPath.includes('/workspaces/')).toBe(true);
  });
});
tests/quota-manager.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { QuotaManager } from '../src/platform/quota-manager.js';

describe('QuotaManager', () => {
  it('has canConsume and consume methods', () => {
    const q = new QuotaManager();
    expect(typeof q.canConsume).toBe('function');
    expect(typeof q.consume).toBe('function');
  });
});
tests/billing.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { BillingService } from '../src/platform/billing.js';

describe('BillingService', () => {
  it('records billing events', () => {
    const billing = new BillingService();
    const result = billing.record({
      tenantId: 'ten_test',
      eventType: 'run',
      quantity: 1,
      unitCostUsd: 0.25,
    });

    expect(result.totalCostUsd).toBe(0.25);
  });
});
tests/template-curator-schema.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { TemplateCuratorSchema } from '../src/prompts/template-curator.js';

describe('TemplateCuratorSchema', () => {
  it('validates template review', () => {
    const parsed = TemplateCuratorSchema.parse({
      publishable: true,
      category: 'research',
      strengths: ['Good governance split'],
      risks: ['May be slower than baseline'],
      summary: 'Ready for tenant visibility',
    });

    expect(parsed.publishable).toBe(true);
  });
});
tests/comment-service.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { CommentService } from '../src/platform/comments.js';

describe('CommentService', () => {
  it('creates comments', () => {
    const c = new CommentService();
    const result = c.create({
      tenantId: 'ten_test',
      subjectKind: 'hosted_run',
      subjectRef: 'hr_test',
      body: 'Looks good.',
    });

    expect(result.commentId.startsWith('cmt_')).toBe(true);
  });
});
tests/remote-agent.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { RemoteAgentService } from '../src/platform/remote-agent.js';

describe('RemoteAgentService', () => {
  it('registers an agent', () => {
    const svc = new RemoteAgentService();
    const result = svc.register({
      agentName: `agent-${Date.now()}`,
      deploymentMode: 'local',
    });

    expect(result.agentId.startsWith('agt_')).toBe(true);
  });
});
tests/sdk-client.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { AutoOrgClient } from '../src/sdk/ts/client.js';

describe('AutoOrgClient', () => {
  it('constructs a client', () => {
    const client = new AutoOrgClient({
      baseUrl: 'http://localhost:3000',
      apiKey: 'ak_test',
    });

    expect(typeof client.createHostedRun).toBe('function');
  });
});
33. Run instructions for Phase 9
Bash

# 1. Apply migration
bun run src/db/migrate-phase9.ts

# 2. Seed templates/roles if desired
#    (call your bootstrap scripts once you add them)

# 3. Start API server
bun run src/api/server.ts

# 4. Start dashboard
cd web && bun run dev

# 5. Start daemon / hosted-run worker
bun run src/runtime/daemon.ts

# 6. Sign up a tenant + owner
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email":"owner@example.com",
    "displayName":"Owner",
    "password":"secret123",
    "tenantSlug":"acme",
    "tenantDisplayName":"Acme"
  }'

# 7. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email":"owner@example.com",
    "password":"secret123"
  }'

# 8. Create workspace
curl -X POST http://localhost:3000/api/workspaces \
  -H "Authorization: Bearer <session-or-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "slug":"main",
    "displayName":"Main Workspace",
    "isolationMode":"directory"
  }'

# 9. Submit hosted run
curl -X POST http://localhost:3000/api/hosted-runs \
  -H "Authorization: Bearer <session-or-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId":"ws_...",
    "mode":"single_org",
    "request":{
      "missionText":"Improve the current implementation plan."
    }
  }'

# 10. View billing summary
curl -H "Authorization: Bearer <session-or-api-key>" \
  http://localhost:3000/api/billing/summary

# 11. View admin observability
curl -H "Authorization: Bearer <session-or-api-key>" \
  http://localhost:3000/api/admin/observability
34. Optional .env additions for Phase 9
Bash

# ── PLATFORM / DEPLOYMENT ────────────────────────────────────
AUTOORG_DEPLOYMENT_MODE=local
AUTOORG_BASE_URL=http://localhost:3000
AUTOORG_PUBLIC_APP_URL=http://localhost:3000

# ── AUTH ─────────────────────────────────────────────────────
AUTOORG_SESSION_TTL_DAYS=30
AUTOORG_REQUIRE_EMAIL_VERIFICATION=0
AUTOORG_COOKIE_NAME=autoorg_session

# ── MULTI-TENANCY / STORAGE ──────────────────────────────────
AUTOORG_TENANT_ROOT=tenants
AUTOORG_DEFAULT_ISOLATION_MODE=directory
AUTOORG_MAX_WORKSPACES_PER_TENANT=20

# ── QUOTAS / BILLING ─────────────────────────────────────────
AUTOORG_DEFAULT_PLAN=team
AUTOORG_RUN_BASE_COST_USD=0.01
AUTOORG_TOKEN_UNIT_COST_USD=0.000003
AUTOORG_TOOL_CALL_COST_USD=0.0005
AUTOORG_STORAGE_GB_COST_USD=0.10
AUTOORG_AGENT_MINUTE_COST_USD=0.01

# ── BACKUPS / RETENTION ──────────────────────────────────────
AUTOORG_BACKUP_DIR=artifacts/backups
AUTOORG_EXPORT_DIR=artifacts/exports
AUTOORG_ENABLE_RETENTION=1

# ── REMOTE AGENTS ────────────────────────────────────────────
AUTOORG_AGENT_HEARTBEAT_MS=15000
AUTOORG_AGENT_LEASE_MS=60000
AUTOORG_HOSTED_POLL_MS=3000
35. What Phase 9 now gives you
At this point AutoOrg can:

text

✅ Support multiple tenants and users safely
✅ Authenticate via sessions or API keys
✅ Enforce RBAC at tenant and workspace scope
✅ Provision isolated workspaces per tenant
✅ Accept hosted runs through a public API
✅ Dispatch work to local or remote agents
✅ Enforce quotas and meter billing
✅ Let teams collaborate with comments and approvals
✅ Publish and reuse org templates and role packs
✅ Back up, export, and restore workspaces
✅ Track compliance and retention events
✅ Expose admin observability and a basic SDK
This is the phase where AutoOrg stops being a research operating system and becomes a usable product platform.

36. Recommended implementation order
I’d implement Phase 9 in this order:

DB migration
auth + tenant + session model
RBAC
workspace provisioning + isolation
hosted runs
remote agents
quotas + billing
templates + role registry
backup/restore + compliance logs
admin observability
public SDK
UI
Why:

auth/RBAC/workspace isolation are the non-negotiable foundation,
hosted runs make the platform useful,
quotas/billing make it operable,
templates/SDK make it extensible.





here is Phase 10 expanded in the same detailed format.

Phase 9 made AutoOrg a platform.
Phase 10 makes it a learning organization.

This is the phase where AutoOrg begins improving its own:

prompts,
policies,
roles,
routing,
memory footprint,
model choices,
template defaults,
but only under strict constraints:

benchmark simulation before rollout,
approval-gated activation,
lineage and versioning,
policy/audit logging,
regression detection,
drift detection.
So this is not unconstrained self-modification.
It is bounded, benchmarked, auditable self-improvement.

AutoOrg — Phase 10: Learning Organization
Pattern Mining, Prompt/Policy/Role Optimization, Memory Utility Pruning, Routing Optimization, Distillation, Simulation Gate, Drift Guard, Self-Improvement Rollouts
WHAT PHASE 10 ADDS
text

Phase 9   ── Multi-tenant platform + hosted runs + quotas + billing + templates + SDK

Phase 10  ── ┌──────────────────────────────────────────────────────────────┐
             │ Distill winning patterns from history + results.tsv         │
             │ Prompt / policy optimizer from successful cycles            │
             │ Role evolution based on benchmark performance               │
             │ Memory pruning via learned utility                          │
             │ Cost-quality routing optimizer                              │
             │ Distillation/export jobs from traces                        │
             │ Simulate-before-rollout release gate                        │
             │ Self-improvement proposals reviewed under constitution       │
             │ Meta-critic for prompt drift detection                      │
             │ Continuous adaptation without breaking auditability          │
             └──────────────────────────────────────────────────────────────┘
DIRECTORY ADDITIONS
text

src/
├── learning/
│   ├── version-manager.ts          ← prompt/policy/role/routing version state
│   ├── lineage.ts                  ← improvement ancestry graph
│   ├── pattern-miner.ts            ← mine winning patterns from runs/evals
│   ├── proposal-manager.ts         ← self-improvement proposal lifecycle
│   ├── prompt-optimizer.ts         ← generate candidate prompt revisions
│   ├── policy-optimizer.ts         ← generate candidate policy revisions
│   ├── role-evolver.ts             ← evolve role definitions/manifests
│   ├── memory-utility.ts           ← estimate utility of memory artifacts
│   ├── memory-pruner.ts            ← archive/prune low-utility memory
│   ├── routing-optimizer.ts        ← optimize model routing by mission class
│   ├── adapter-distiller.ts        ← export high-quality traces to datasets
│   ├── simulator.ts                ← simulate candidate changes on benchmarks
│   ├── release-gate.ts             ← benchmark + drift + approval gate
│   ├── drift-detector.ts           ← detect prompt/behavior drift
│   └── learning-orchestrator.ts    ← periodic bounded self-improvement loop
├── prompts/
│   ├── pattern-extractor.ts        ← extract repeatable winning patterns
│   ├── improvement-proposer.ts     ← convert patterns into change proposals
│   ├── prompt-optimizer.ts         ← revise a target prompt
│   ├── policy-optimizer.ts         ← revise policy config/rules
│   ├── role-evolver.ts             ← revise role instructions/manifests
│   ├── memory-utility.ts           ← utility scoring for memory items
│   ├── routing-optimizer.ts        ← routing rules from benchmark evidence
│   ├── rollout-simulator.ts        ← explain simulation results
│   └── prompt-drift-auditor.ts     ← detect harmful behavior drift
├── db/
│   ├── schema-phase10.sql
│   └── migrate-phase10.ts
└── api/
    └── learning-routes.ts          ← cycles, proposals, versions, simulations

artifacts/
├── learning/
│   ├── patterns/
│   ├── proposals/
│   ├── simulations/
│   ├── releases/
│   ├── drift/
│   ├── routing/
│   ├── distillation/
│   └── memory/
1. Phase 10 DB schema