TypeScript

import { getDb } from '@/db/migrate.js';
import { PortfolioRunner } from '@/portfolio/portfolio-runner.js';
import { PortfolioAllocator } from '@/portfolio/allocator.js';
import { Tournament } from '@/portfolio/tournament.js';
import { BestOfN } from '@/portfolio/best-of-n.js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handlePortfolioRoutes(url: URL, req: Request) {
  const method = req.method;

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

  if (url.pathname === '/api/portfolio/run' && method === 'POST') {
    const body = await req.json() as {
      missionText: string;
      variantKeys?: string[];
      mode?: 'mission' | 'benchmark_seeded' | 'tournament';
      initialBudgetUsd: number;
      roundLimit?: number;
      topKSurvive?: number;
    };

    const runner = new PortfolioRunner();
    const result = await runner.run(body);
    return json({ ok: true, result });
  }

  const variantsMatch = url.pathname.match(/^\/api\/portfolio\/([^/]+)\/variants$/);
  if (variantsMatch && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM portfolio_variants
      WHERE portfolio_run_id = ?
      ORDER BY latest_score DESC, prior_score DESC
    `).all(variantsMatch[1]);
    db.close();
    return json(rows);
  }

  const allocMatch = url.pathname.match(/^\/api\/portfolio\/([^/]+)\/allocations$/);
  if (allocMatch && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM portfolio_allocations
      WHERE portfolio_run_id = ?
      ORDER BY created_at DESC
    `).all(allocMatch[1]);
    db.close();
    return json(rows);
  }

  const councilMatch = url.pathname.match(/^\/api\/portfolio\/([^/]+)\/council$/);
  if (councilMatch && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM judge_council_votes
      WHERE portfolio_run_id = ?
      ORDER BY created_at DESC
    `).all(councilMatch[1]);
    db.close();
    return json(rows);
  }

  const exchangeMatch = url.pathname.match(/^\/api\/portfolio\/([^/]+)\/exchanges$/);
  if (exchangeMatch && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM portfolio_exchanges
      WHERE portfolio_run_id = ?
      ORDER BY created_at DESC
    `).all(exchangeMatch[1]);
    db.close();
    return json(rows);
  }

  const failureMatch = url.pathname.match(/^\/api\/portfolio\/([^/]+)\/failures$/);
  if (failureMatch && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM failure_containment_events
      WHERE portfolio_run_id = ?
      ORDER BY created_at DESC
    `).all(failureMatch[1]);
    db.close();
    return json(rows);
  }

  const synthMatch = url.pathname.match(/^\/api\/portfolio\/([^/]+)\/syntheses$/);
  if (synthMatch && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM portfolio_syntheses
      WHERE portfolio_run_id = ?
      ORDER BY created_at DESC
    `).all(synthMatch[1]);
    db.close();
    return json(rows);
  }

  return null;
}
21. Minimal UI additions
text

web/app/
├── portfolio/page.tsx
├── capital/page.tsx
├── council/page.tsx
├── tournament/page.tsx
└── exchanges/page.tsx
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
</nav>
/portfolio page
Show:

active portfolio runs
mission summary
status
current winner
remaining budget
round count
/capital page
Show:

per-variant allocations
spend vs budget
utility proxy
eliminated/quarantined status
/council page
Show:

judge votes
vote totals
winner by round
concerns per judge
/tournament page
Show:

bracket or pairwise matches
winners
referee rationale
/exchanges page
Show:

artifact exchange requests
quarantine status
blocked vs delivered
delivered path
22. Tests for Phase 8
tests/variant-catalog.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { VariantCatalog } from '../src/portfolio/org-variant.js';

describe('VariantCatalog', () => {
  it('loads variant specs', async () => {
    const catalog = new VariantCatalog();
    const specs = await catalog.loadAll().catch(() => []);
    expect(Array.isArray(specs)).toBe(true);
  });
});
tests/branch-strategy.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { BranchStrategy } from '../src/portfolio/branch-strategy.js';

describe('BranchStrategy', () => {
  it('has prepare and cleanup methods', async () => {
    const s = new BranchStrategy();
    expect(typeof s.prepare).toBe('function');
    expect(typeof s.cleanup).toBe('function');
  });
});
tests/failure-containment.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { FailureContainment } from '../src/portfolio/failure-containment.js';

describe('FailureContainment', () => {
  it('kills variants with critical policy failure', () => {
    const fc = new FailureContainment('pr_test');
    expect(fc.shouldKill({
      spentBudgetUsd: 1,
      allocatedBudgetUsd: 10,
      securityFindings: 0,
      criticalPolicyFailure: true,
    })).toBe(true);
  });
});
tests/portfolio-allocator-schema.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { PortfolioAllocationSchema } from '../src/prompts/portfolio-allocator.js';

describe('PortfolioAllocationSchema', () => {
  it('validates allocation output', () => {
    const parsed = PortfolioAllocationSchema.parse({
      allocations: [
        {
          variant_id: 'pv_1',
          amount_usd: 2.5,
          action: 'rebalance',
          rationale: 'Strong score per dollar',
        },
      ],
      summary: 'Shift capital to strong grounded variants',
    });

    expect(parsed.allocations[0].amount_usd).toBe(2.5);
  });
});
tests/judge-council-schema.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { JudgeCouncilVoteSchema } from '../src/prompts/judge-council.js';

describe('JudgeCouncilVoteSchema', () => {
  it('validates a council vote', () => {
    const parsed = JudgeCouncilVoteSchema.parse({
      voted_variant_id: 'pv_abc',
      score: 0.88,
      rationale: 'Better grounded and clearer plan',
      concerns: ['Slightly higher cost'],
    });

    expect(parsed.score).toBeGreaterThan(0.8);
  });
});
tests/quarantine-review-schema.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { QuarantineReviewSchema } from '../src/prompts/quarantine-reviewer.js';

describe('QuarantineReviewSchema', () => {
  it('accepts an approved sanitized artifact review', () => {
    const parsed = QuarantineReviewSchema.parse({
      approved: true,
      blocked: false,
      findings: ['Removed one email address'],
      sanitized_summary: 'Safe summarized artifact',
      should_redact_more: false,
    });

    expect(parsed.approved).toBe(true);
  });
});
tests/tournament-referee-schema.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { TournamentRefereeSchema } from '../src/prompts/tournament-referee.js';

describe('TournamentRefereeSchema', () => {
  it('validates a tournament verdict', () => {
    const parsed = TournamentRefereeSchema.parse({
      winner_variant_id: 'pv_win',
      rationale: 'Higher mission fitness and policy compliance',
      edge_cases: ['More expensive but acceptable'],
    });

    expect(parsed.winner_variant_id).toBe('pv_win');
  });
});
tests/portfolio-priors.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { PortfolioPriors } from '../src/portfolio/priors.js';

describe('PortfolioPriors', () => {
  it('returns a prior estimate even without history', () => {
    const priors = new PortfolioPriors();
    const out = priors.estimatePrior({
      variant_key: 'default',
      constitution_variant: 'default',
      template_variant: 'baseline',
      model_map: {},
    });

    expect(typeof out.prior_score).toBe('number');
  });
});
23. Run instructions for Phase 8
Bash

# 1. Apply migration
bun run src/db/migrate-phase8.ts

# 2. Make sure portfolio variants exist
tree portfolio/variants

# 3. Start API/dashboard
bun run src/api/server.ts
cd web && bun run dev

# 4. Launch a portfolio run
curl -X POST http://localhost:3000/api/portfolio/run \
  -H "Content-Type: application/json" \
  -d '{
    "missionText":"Build the best grounded implementation plan for AutoOrg Phase 8.",
    "variantKeys":["default","strict_grounding","research_heavy","quality_heavy"],
    "mode":"mission",
    "initialBudgetUsd":8,
    "roundLimit":3,
    "topKSurvive":2
  }'

# 5. List runs
curl http://localhost:3000/api/portfolio/runs

# 6. Inspect variants
curl http://localhost:3000/api/portfolio/<portfolioRunId>/variants

# 7. Inspect allocations
curl http://localhost:3000/api/portfolio/<portfolioRunId>/allocations

# 8. Inspect council votes
curl http://localhost:3000/api/portfolio/<portfolioRunId>/council

# 9. Inspect exchanges
curl http://localhost:3000/api/portfolio/<portfolioRunId>/exchanges

# 10. Inspect final syntheses
curl http://localhost:3000/api/portfolio/<portfolioRunId>/syntheses
24. Optional .env additions for Phase 8
Bash

# ── PORTFOLIO ────────────────────────────────────────────────
PORTFOLIO_DEFAULT_BUDGET_USD=8
PORTFOLIO_DEFAULT_ROUNDS=3
PORTFOLIO_TOP_K_SURVIVE=2
PORTFOLIO_MAX_VARIANTS=6

# ── BRANCH / WORKTREE ISOLATION ──────────────────────────────
PORTFOLIO_WORKTREE_ROOT=artifacts/portfolio/runs
PORTFOLIO_BRANCH_PREFIX=portfolio

# ── CAPITAL ALLOCATION ───────────────────────────────────────
PORTFOLIO_MIN_EXPLORATION_SHARE=0.15
PORTFOLIO_ELIMINATION_THRESHOLD=0.55
PORTFOLIO_POLICY_FLOOR=0.80

# ── COUNCIL / TOURNAMENT ─────────────────────────────────────
PORTFOLIO_COUNCIL_MODELS=claude-opus-4,claude-sonnet-4-5,gpt-4.1
PORTFOLIO_TOURNAMENT_MAX_VARIANTS=4

# ── EXCHANGE / QUARANTINE ────────────────────────────────────
PORTFOLIO_ALLOW_CROSS_ORG_EXCHANGE=1
PORTFOLIO_QUARANTINE_DIR=artifacts/portfolio/quarantine
PORTFOLIO_EXTERNAL_MEMORY_DIR=memory/external
25. What Phase 8 now gives you
At this point AutoOrg can:

text

✅ Run multiple org variants on the same mission at once
✅ Isolate each variant in its own branch/worktree
✅ Route capital toward better-performing org strategies
✅ Seed variant priors from benchmark history
✅ Use judge councils rather than single-judge selection
✅ Run tournament brackets between strategies
✅ Share artifacts across orgs only through quarantine
✅ Contain failures without collapsing the whole portfolio
✅ Synthesize a stronger final output from top variants
✅ Display the whole portfolio as a capital allocation system
This is the phase where AutoOrg stops being one autonomous organization and becomes an autonomous portfolio manager.

26. Recommended implementation order
I’d implement Phase 8 in this order:

DB migration
variant catalog
branch/worktree isolation
portfolio runner baseline
allocator
judge council
best-of-N synthesis
failure containment
quarantine + exchange bus
tournament mode
API/UI
Why:

first make multiple orgs run safely,
then make portfolio selection work,
then add richer inter-org dynamics.







here is Phase 9 expanded in the same detailed format.

Phase 8 made AutoOrg a portfolio manager.
Phase 9 makes it a platform.

This is the phase where AutoOrg stops being only “the system you run” and becomes “the system other teams can safely use.” That means:

tenants,
users,
auth,
RBAC,
hosted runs,
remote workers,
quotas,
billing,
workspace isolation,
templates,
public API,
SDK,
backups,
retention,
admin observability.
AutoOrg — Phase 9: Productization + Platform
Multi-Tenant Auth, Hosted Runs, Remote Agents, Billing, Workspace Isolation, Templates, API/SDK, Backup/Restore, Admin Ops
WHAT PHASE 9 ADDS
text

Phase 8   ── Portfolio orchestration + capital allocation + councils + best-of-N

Phase 9   ── ┌──────────────────────────────────────────────────────────────┐
             │ Multi-tenant auth / RBAC                                    │
             │ Hosted runs + remote agents                                 │
             │ Org templates / role registry / template marketplace        │
             │ Team collaboration: comments + approvals UI                 │
             │ Billing / quotas / workspace isolation                      │
             │ Deployment modes: local / single-node / cloud / managed     │
             │ Backup / restore / export bundles                           │
             │ Compliance logs + retention policies                        │
             │ Admin observability dashboard                               │
             │ Public API + SDK for launching runs                         │
             └──────────────────────────────────────────────────────────────┘
DIRECTORY ADDITIONS
text

src/
├── platform/
│   ├── auth.ts                     ← login/session/api-key auth
│   ├── rbac.ts                     ← roles, permissions, policy checks
│   ├── tenant-context.ts           ← request-scoped tenant/workspace context
│   ├── workspace-provisioner.ts    ← per-workspace directories, DB namespaces
│   ├── hosted-runner.ts            ← hosted run submission + dispatch
│   ├── remote-agent.ts             ← remote worker heartbeat + claims
│   ├── quota-manager.ts            ← tenant/workspace quotas
│   ├── billing.ts                  ← usage meters + billing events
│   ├── comments.ts                 ← discussion/comments/mentions
│   ├── template-registry.ts        ← org templates + marketplace registry
│   ├── role-registry.ts            ← reusable role pack definitions
│   ├── backup-manager.ts           ← snapshot/export/restore bundles
│   ├── retention-manager.ts        ← retention / purge jobs
│   ├── observability.ts            ← admin metrics snapshots
│   ├── deployment-modes.ts         ← local/single-node/cloud/managed helpers
│   └── sdk-tokens.ts               ← scoped API tokens for SDK clients
├── sdk/
│   └── ts/
│       ├── client.ts               ← TypeScript SDK client
│       ├── types.ts
│       └── index.ts
├── prompts/
│   ├── template-curator.ts         ← evaluate/publish templates
│   ├── comment-summarizer.ts       ← summarize review threads
│   └── usage-analyzer.ts           ← analyze spend/quota anomalies
├── db/
│   ├── schema-phase9.sql
│   └── migrate-phase9.ts
└── api/
    ├── auth-routes.ts
    ├── workspace-routes.ts
    ├── billing-routes.ts
    ├── admin-routes.ts
    ├── template-routes.ts
    └── sdk-routes.ts

platform/
├── templates/
│   ├── baseline.json
│   ├── research_org.json
│   ├── quality_org.json
│   └── portfolio_org.json
└── roles/
    ├── engineer.json
    ├── critic.json
    ├── archivist.json
    └── coordinator.json

artifacts/
├── backups/
├── exports/
├── observability/
└── compliance/
    ├── audit/
    └── retention/
1. Phase 9 DB schema