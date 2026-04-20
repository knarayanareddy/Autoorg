Add these route snippets to handleRequest(...).

Imports
TypeScript

import { getDb } from '@/db/migrate.js';
import { WorkspaceLock } from '@/runtime/workspace-lock.js';
import { RecoveryJournal } from '@/runtime/recovery-journal.js';
import { ApprovalEnforcer } from '@/runtime/approval-enforcer.js';
import { translateGitHubIssueEvent } from '@/integrations/issue-translator.js';
Routes
TypeScript

// GET /api/locks
if (url.pathname === '/api/locks' && method === 'GET') {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM workspace_locks ORDER BY updated_at DESC`).all();
  db.close();
  return json(rows);
}

// POST /api/daemon/recover
if (url.pathname === '/api/daemon/recover' && method === 'POST') {
  const body = await req.json() as { runId: string };
  const recovered = await recoverInterruptedRun(body.runId);
  return json({ ok: true, recovered });
}

// GET /api/budgets?runId=...
if (url.pathname === '/api/budgets' && method === 'GET') {
  const runId = url.searchParams.get('runId');
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM team_budgets
    ${runId ? 'WHERE run_id = ?' : ''}
    ORDER BY team_id, budget_type
  `).all(...(runId ? [runId] : []));
  db.close();
  return json(rows);
}

// GET /api/issue-tasks?runId=...
if (url.pathname === '/api/issue-tasks' && method === 'GET') {
  const runId = url.searchParams.get('runId');
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM issue_tasks
    ${runId ? 'WHERE run_id = ?' : ''}
    ORDER BY updated_at DESC
  `).all(...(runId ? [runId] : []));
  db.close();
  return json(rows);
}

// POST /api/github-events/:id/translate
params = matchRoute(url, method, '/api/github-events/:id/translate', 'POST');
if (params) {
  const body = await req.json().catch(() => ({})) as { runId?: string };
  const result = await translateGitHubIssueEvent(params.id!, body.runId);
  return json({ ok: true, result });
}

// POST /api/pending-actions/materialize
if (url.pathname === '/api/pending-actions/materialize' && method === 'POST') {
  const body = await req.json() as { runId: string };
  const enforcer = new ApprovalEnforcer(body.runId);
  await enforcer.materializeApprovedActions();
  return json({ ok: true });
}
20. Minimal UI additions
You already added an approvals page in Phase 5. For 5.1, add:

text

web/app/
├── budgets/page.tsx
├── locks/page.tsx
└── issues/page.tsx
Patch web/app/layout.tsx nav
React

<nav className="ml-auto flex gap-6 text-sm">
  <a href="/" className="text-gray-400 hover:text-cyan-400 transition-colors">Dashboard</a>
  <a href="/graph" className="text-gray-400 hover:text-cyan-400 transition-colors">Graph</a>
  <a href="/approvals" className="text-gray-400 hover:text-cyan-400 transition-colors">Approvals</a>
  <a href="/budgets" className="text-gray-400 hover:text-cyan-400 transition-colors">Budgets</a>
  <a href="/locks" className="text-gray-400 hover:text-cyan-400 transition-colors">Locks</a>
  <a href="/issues" className="text-gray-400 hover:text-cyan-400 transition-colors">Issues</a>
  <a href="/interview" className="text-gray-400 hover:text-cyan-400 transition-colors">Interview</a>
</nav>
I’d keep these pages thin:

Budgets: show team budget bars + overages.
Locks: show active workspace lock holder and expiry.
Issues: translated GitHub issues + status.
21. Tests for Phase 5.1
tests/approval-enforcer.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { ApprovalEnforcer } from '../src/runtime/approval-enforcer.js';
import { ApprovalGate } from '../src/runtime/approval-gate.js';

describe('ApprovalEnforcer', () => {
  it('stages a commit candidate instead of committing immediately', async () => {
    const enforcer = new ApprovalEnforcer('run_test');
    const staged = await enforcer.stageCommitCandidate({
      cycleNumber: 1,
      targetFile: 'workspace/current_output.md',
      outputText: '# Candidate output',
      score: {
        composite: 0.77,
        groundedness: 0.8,
        novelty: 0.7,
        consistency: 0.8,
        missionAlignment: 0.78,
        justification: 'Improved result',
      } as any,
      summary: 'Improved result',
    });

    expect(staged.approvalId).toMatch(/^ap_/);
    expect(staged.actionId).toMatch(/^act_/);
  });
});
tests/workspace-lock.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { WorkspaceLock } from '../src/runtime/workspace-lock.js';

describe('WorkspaceLock', () => {
  it('prevents double-acquire of the same lock', () => {
    const lock = new WorkspaceLock();
    lock.acquire('repo:test', 'holder_a', 'run_a', 60_000);
    expect(() => lock.acquire('repo:test', 'holder_b', 'run_b', 60_000)).toThrow();
  });
});
tests/recovery-journal.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { RecoveryJournal } from '../src/runtime/recovery-journal.js';

describe('RecoveryJournal', () => {
  it('stores and reads latest checkpoint', () => {
    const journal = new RecoveryJournal('run_recovery_test');
    journal.checkpoint({
      cycleNumber: 7,
      bestScore: 0.81,
      plateauCount: 2,
      consecutiveRejects: 0,
      stage: 'post_score',
    });

    const latest = journal.latest();
    expect(latest?.cycleNumber).toBe(7);
    expect(latest?.stage).toBe('post_score');
  });
});
tests/lease-manager.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { LeaseManager } from '../src/runtime/lease-manager.js';

describe('LeaseManager', () => {
  it('creates a lease and can complete it', () => {
    const leases = new LeaseManager('run_lease_test');
    const leaseId = leases.leaseTask({
      cycleNumber: 1,
      taskId: 'task_123',
      workerRole: 'Engineer',
      workerInstance: 'eng_1',
    });

    expect(leaseId).toMatch(/^lease_/);
    leases.complete(leaseId, { ok: true });
  });
});
tests/budget-manager.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { BudgetManager } from '../src/runtime/budget-manager.js';

describe('BudgetManager', () => {
  it('enforces team budgets', () => {
    const budgets = new BudgetManager('run_budget_test');
    budgets.seedDefaults('team_research', { usdLimit: 1.0 });

    expect(budgets.canSpend('team_research', 'usd', 0.5)).toBe(true);
    budgets.spend({
      teamId: 'team_research',
      budgetType: 'usd',
      delta: 0.5,
      reason: 'test',
    });

    expect(budgets.canSpend('team_research', 'usd', 0.6)).toBe(false);
  });
});
tests/issue-translator.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { IssueTranslationSchema } from '../src/prompts/issue-translator.js';

describe('Issue translator schema', () => {
  it('validates translated issue output', () => {
    const parsed = IssueTranslationSchema.parse({
      translated_mission: 'Fix the scheduler race condition.',
      acceptance_criteria: ['No duplicate job execution', 'Add regression test'],
      suggested_team: 'Platform',
      task_type: 'quality',
      risk_level: 'medium',
      rationale: 'Touches scheduling behavior',
      needs_human_approval: false,
    });

    expect(parsed.suggested_team).toBe('Platform');
  });
});
tests/diff-summarizer.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { DiffSummarySchema } from '../src/prompts/diff-summarizer.js';

describe('Diff summary schema', () => {
  it('accepts a structured diff summary', () => {
    const parsed = DiffSummarySchema.parse({
      summary: 'Adds strict approval blocking before git commit.',
      files_changed: ['src/runtime/approval-enforcer.ts', 'src/runtime/orchestrator.ts'],
      risk_notes: ['May change commit timing semantics'],
      tests_suggested: ['approval-enforcer test'],
      rollback_plan: 'Disable strictApprovalBlocking and revert pending action flow.',
    });

    expect(parsed.files_changed.length).toBe(2);
  });
});
22. Run instructions for Phase 5.1
Bash

# 1. Apply DB migration
bun run src/db/migrate-phase5_1.ts

# 2. Start daemon
bun run src/runtime/daemon.ts

# 3. Start API
bun run src/api/server.ts

# 4. Start dashboard
cd web && bun run dev

# 5. Start orchestrator
bun start

# 6. Approve staged commits from UI or API
#    Then materialize approved actions:
curl -X POST http://localhost:3000/api/pending-actions/materialize \
  -H "Content-Type: application/json" \
  -d '{"runId":"run_..."}'
23. Optional .env additions for Phase 5.1
Add to .env.example:

Bash

# ── HARDENING / DAEMON IDENTITY ──────────────────────────────
AUTOORG_INSTANCE_NAME=default
AUTOORG_WORKSPACE_KEY=repo:default
AUTOORG_APPROVAL_ARTIFACT_DIR=artifacts/approvals
AUTOORG_RECOVERY_DIR=artifacts/recovery

# ── ULTRAPLAN SLA DEFAULTS ───────────────────────────────────
ULTRAPLAN_MAX_DURATION_MS=900000
ULTRAPLAN_CHECKPOINT_INTERVAL_MS=120000

# ── BUDGET DEFAULTS ──────────────────────────────────────────
DEFAULT_TEAM_USD_BUDGET=1.5
DEFAULT_TEAM_TOKEN_BUDGET=40000
DEFAULT_TEAM_TOOL_CALL_BUDGET=50
DEFAULT_TEAM_MINUTE_BUDGET=20

# ── LOCK / LEASE DEFAULTS ────────────────────────────────────
WORKSPACE_LOCK_TTL_MS=90000
WORKER_LEASE_TTL_MS=45000
JOB_LEASE_TTL_MS=60000
24. What Phase 5.1 now gives you
At this point AutoOrg can:

text

✅ Refuse to commit until approval exists
✅ Persist candidate commit artifacts safely outside live git history
✅ Resume runs after crash or daemon restart
✅ Reclaim orphaned worker tasks after heartbeat expiry
✅ Prevent two daemons from mutating the same repo
✅ Actually execute and record scheduled jobs
✅ Translate GitHub issues into org-native delegated tasks
✅ Generate PR summaries from the actual patch, not guessed summaries
✅ Enforce team-level resource budgets
✅ Give each subteam its own memory lane
✅ Timebox and checkpoint ULTRAPLAN sessions
✅ Produce operational incident logs for debugging
This is the phase where AutoOrg stops being merely autonomous and becomes operationally trustworthy.







proceeding to Phase 6.

Your current Autoorg.md already establishes the core repository contract and runtime layout: org.md, constitution.md, results.tsv, role files, mailbox IPC, three-tier memory, knowledge graph, workspace, runtime, adapters, UI, config, and tests. It also already adds Phase 5 with hierarchical coordination, daemon mode, scheduler, approval gates, GitHub events, PR draft generation, and daemon/API helpers. 
1

So Phase 6 should not rewrite the system. It should slot in as a new layer: a tool-using execution substrate that sits under the agents and above the connectors/sandbox, while remaining compatible with the existing ratchet, graph grounding, memory, approvals, daemon, and Phase 5.1 hardening model. That fits the architecture you already laid down. 
1

AutoOrg — Phase 6: Tool-Using Organization
Tool Registry, Sandboxed Execution, Evidence Packs, Replayable Tool Traces
WHAT PHASE 6 ADDS
text

Phase 5.1 ── Strict approval blocking + crash recovery + leases + budgets + partitions

Phase 6   ── ┌──────────────────────────────────────────────────────────────┐
             │ Tool registry with explicit capability manifests             │
             │ Role/team-specific tool allowlists + per-tool policy         │
             │ Safe retrieval tools: repo search, doc search, web fetch,    │
             │ GitHub issue/PR search, local file read                      │
             │ Sandboxed code execution with timeout / cwd / env controls   │
             │ Structured tool-call traces persisted to DB + artifacts      │
             │ Evidence packs attached to worker outputs and CEO synthesis   │
             │ Tool-aware Critic: missing verification becomes a defect      │
             │ Tool-aware Ratchet scoring: unsupported claims get clamped    │
             │ Replayable tool traces for debugging and benchmark replay     │
             │ External connectors as first-class organizational tools       │
             └──────────────────────────────────────────────────────────────┘
DIRECTORY ADDITIONS
text

src/
├── tools/
│   ├── registry.ts               ← tool manifest registry
│   ├── tool-runner.ts            ← policy checks + execution + trace logging
│   ├── tool-policy.ts            ← role/team allowlists and limits
│   ├── evidence-pack.ts          ← bundle evidence into artifacts + DB
│   ├── replay.ts                 ← replay stored tool traces
│   ├── sandbox.ts                ← restricted command/code execution
│   └── manifests/
│       ├── repo-search.ts        ← rg-based repo search
│       ├── repo-read-file.ts     ← safe local file read
│       ├── local-docs-search.ts  ← markdown/docs search
│       ├── web-fetch.ts          ← safe HTTP fetch / text extraction
│       ├── github-search.ts      ← issue/PR search via GitHub integration
│       └── sandbox-exec.ts       ← shell/code execution in workspace
├── integrations/
│   └── connectors/
│       ├── repo-search.ts
│       ├── local-docs.ts
│       ├── web-fetch.ts
│       ├── github-search.ts
│       └── ticket-search.ts
├── prompts/
│   ├── tool-planner.ts           ← decide which tools are needed
│   ├── evidence-synthesizer.ts   ← final answer grounded in evidence pack
│   ├── verification-auditor.ts   ← claim → evidence coverage analysis
│   └── tool-aware-critic.ts      ← critic prompt for unsupported claims
├── db/
│   ├── schema-phase6.sql
│   └── migrate-phase6.ts
└── api/
    └── tool-routes.ts            ← tools, traces, evidence, replay

artifacts/
├── tools/
│   ├── traces/
│   └── outputs/
└── evidence/
    ├── packs/
    └── merged/
1. Phase 6 DB schema