React

'use client';

import { useEffect, useState } from 'react';

interface Approval {
  id: string;
  run_id: string;
  cycle_number: number | null;
  approval_type: string;
  subject: string;
  requested_by: string;
  status: string;
  summary: string;
  requested_at: string;
}

export default function ApprovalsPage() {
  const [items, setItems] = useState<Approval[]>([]);

  const load = async () => {
    const res = await fetch('/api/approvals');
    const data = await res.json() as Approval[];
    setItems(data);
  };

  const approve = async (id: string) => {
    await fetch(`/api/approvals/${id}/approve`, { method: 'POST' });
    await load();
  };

  const reject = async (id: string) => {
    await fetch(`/api/approvals/${id}/reject`, { method: 'POST' });
    await load();
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Approval Queue</h1>
        <p className="text-gray-500 text-sm mt-1">
          Human review checkpoints for commits, ULTRAPLAN pivots, and daemon actions.
        </p>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="text-gray-600">No pending approvals.</div>
        ) : items.map(item => (
          <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-gray-200 font-medium">{item.summary}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {item.approval_type} · {item.id} · cycle {item.cycle_number ?? '—'}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  requested by {item.requested_by} at {new Date(item.requested_at).toLocaleString()}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => approve(item.id)}
                  className="bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded text-sm"
                >
                  Approve
                </button>
                <button
                  onClick={() => reject(item.id)}
                  className="bg-red-700 hover:bg-red-600 text-white px-3 py-2 rounded text-sm"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
14. Patch web/app/layout.tsx nav again
Add Approvals:

React

          <nav className="ml-auto flex gap-6 text-sm">
            <a href="/"           className="text-gray-400 hover:text-cyan-400 transition-colors">Dashboard</a>
            <a href="/graph"      className="text-gray-400 hover:text-cyan-400 transition-colors">Graph</a>
            <a href="/approvals"  className="text-gray-400 hover:text-cyan-400 transition-colors">Approvals</a>
            <a href="/interview"  className="text-gray-400 hover:text-cyan-400 transition-colors">Interview</a>
          </nav>
15. Tests for Phase 5
tests/approval-gate.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { ApprovalGate } from '../src/runtime/approval-gate.js';
import { getDb } from '../src/db/migrate.js';

describe('ApprovalGate', () => {
  it('creates and approves a request', () => {
    const gate = new ApprovalGate();
    const id = gate.request({
      runId: 'run_test',
      cycleNumber: 1,
      approvalType: 'commit',
      subject: 'abc123',
      requestedBy: 'system',
      summary: 'Test approval',
    });

    expect(id).toMatch(/^ap_/);
    expect(gate.isApproved(id)).toBe(false);

    gate.approve(id, 'tester');
    expect(gate.isApproved(id)).toBe(true);
  });
});
tests/scheduler.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { Scheduler } from '../src/runtime/scheduler.js';

describe('Scheduler', () => {
  it('creates a scheduled job', () => {
    const scheduler = new Scheduler();
    const id = scheduler.createJob({
      jobType: 'health_check',
      cronExpr: 'every_5m',
    });

    expect(id).toMatch(/^job_/);
  });

  it('lists due jobs without crashing', () => {
    const scheduler = new Scheduler();
    const jobs = scheduler.dueJobs();
    expect(Array.isArray(jobs)).toBe(true);
  });
});
tests/team-manager.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { TeamManager } from '../src/runtime/team-manager.js';

describe('TeamManager', () => {
  it('creates a team and members', () => {
    const tm = new TeamManager(`run_tm_${Date.now()}`);
    const teamId = tm.createTeam({
      name: 'Research',
      mission: 'Do research',
      workerRoles: ['Engineer', 'Archivist'],
    }, 1);

    expect(teamId).toMatch(/^team_/);

    const members = tm.getTeamMembers(teamId);
    expect(members).toContain('Engineer');
    expect(members).toContain('Archivist');
  });
});
16. Run instructions for Phase 5
Bash

# 1. Apply DB migration
bun run src/db/migrate-phase5.ts

# 2. Start daemon in one terminal
bun run src/runtime/daemon.ts

# 3. Start API
bun run src/api/server.ts

# 4. Start dashboard
cd web && bun run dev

# 5. Start orchestrator
bun start
17. Optional .env additions for Phase 5
Add to .env.example:

Bash

# ── GITHUB INTEGRATION ──────────────────────────────────────
GITHUB_TOKEN=
GITHUB_WEBHOOK_SECRET=
GITHUB_API_BASE_URL=https://api.github.com
18. What Phase 5 now gives you
At this point AutoOrg can:

organize work into departments
let team leads coordinate narrower missions
trigger a deep strategic planner when stuck
run as a daemon
execute scheduled jobs
require human approvals
ingest GitHub webhooks
generate PR drafts/comments
This is the first phase where AutoOrg behaves like a real always-on research organization OS, not just a loop.

19. Recommended next move
The strongest next phase is Phase 5.1 hardening, not Phase 6 yet.

That would add:

strict approval blocking
daemon run recovery after crash/restart
job execution workers with leases
GitHub issue → org task translation
PR patch summarization from actual git diff
multi-run concurrency safety
subteam-specific memory partitions
resource budgets per team
SLA / timeout enforcement for ULTRAPLAN
If you want, say:

“continue with Phase 5.1 hardening”






PART 17: THE NEXT BUILD PHASES

Phase 5.1 — Weeks 11–12: Operational Hardening
text
✅ Strict approval blocking (commit / push / merge physically impossible without an approved gate)
✅ Daemon recovery journal (resume unfinished runs after crash or restart)
✅ Worker leases + heartbeat-based job reclaim
✅ Multi-run concurrency locks (no two daemons mutate the same workspace)
✅ GitHub issue → org task translation
✅ PR patch summarization from actual git diff (not prompt summary only)
✅ Per-team budgets + token quotas
✅ Subteam-specific memory partitions
✅ ULTRAPLAN SLAs (timeout, cancellation, checkpointing)
✅ Incident log + run recovery diagnostics

Milestone: AutoOrg can run unattended for 72+ hours, crash, restart, and resume safely without duplicate commits, orphaned jobs, or approval bypasses.

Phase 6 — Weeks 13–15: Tool-Using Organization
text
✅ Tool registry with explicit capability manifests
✅ Safe retrieval tools (web fetch, docs fetch, repo search, issue search)
✅ Sandboxed code execution per role
✅ Structured tool-call traces in transcripts and DB
✅ Tool budgets and allowlists per role / team
✅ Evidence packs attached to proposals
✅ External connectors (GitHub, local files, docs, tickets, APIs)
✅ Tool-use-aware Critic ("you should have verified this with a tool")
✅ Tool-use-aware Ratchet Judge penalties for unsupported claims
✅ Replayable tool traces for debugging

Milestone: AutoOrg shifts from a “thinking organization” to an “acting organization” that can inspect, verify, and operate on real systems under policy.

Phase 6.1 — Week 16: Safety + Provenance Hardening
text
✅ Policy engine for every action class (READ / PROPOSE / PATCH / EXECUTE / PUBLISH)
✅ Reversible action ledger
✅ Provenance chain: claim → citation → graph node → source chunk → seed material
✅ Signed run manifests + immutable artifact metadata
✅ Secret redaction + PII filters in transcripts and memory
✅ Sandbox escape tests + permission fuzzing
✅ Risk-tiered approvals (high-risk actions require stronger approval)
✅ Unsafe-action detector in Critic
✅ Judge-side policy compliance score
✅ Security audit export

Milestone: Every non-trivial action is attributable, policy-checked, and reversible.

Phase 7 — Weeks 17–19: Benchmark Lab + Regression Evals
text
✅ Standard benchmark suite of org.md missions
✅ Gold outputs + acceptance bands
✅ Cross-model leaderboard
✅ Constitution A/B testing
✅ Regression alarms on score, cost, latency, groundedness, and novelty
✅ Offline replay of historical runs
✅ “Why did this regress?” evaluator
✅ Benchmark mode in CI
✅ Org template bake-offs
✅ Judge calibration harness

Milestone: You can prove a change made AutoOrg better, not just different.

Phase 8 — Weeks 20–22: Portfolio Orchestration
text
✅ Multiple concurrent orgs on one mission
✅ Competing constitutions / role mixes / model maps
✅ Portfolio allocator routes budget to best-performing orgs
✅ Judge ensemble / council mode
✅ Cross-org artifact exchange with quarantine
✅ Tournament mode for org.md strategies
✅ Best-of-N synthesis layer
✅ Branch-per-org git strategy
✅ Portfolio dashboard with capital allocation view
✅ Failure containment between orgs

Milestone: AutoOrg becomes a research portfolio manager, not just a single autonomous loop.

Phase 9 — Weeks 23–26: Productization + Platform
text
✅ Multi-tenant auth / RBAC
✅ Hosted runs + remote agents
✅ Org templates / role registry / marketplace
✅ Team collaboration + comments + approvals UI
✅ Billing / quotas / workspace isolation
✅ Deployment modes (local, single-node, cloud worker, managed)
✅ Backup / restore / export bundles
✅ Compliance logs + retention policies
✅ Admin observability dashboard
✅ Public API / SDK for launching runs

Milestone: External teams can use AutoOrg reliably as a platform, not just as an internal experiment.

Phase 10 — Weeks 27–30: Learning Organization
text
✅ Distill winning patterns from git history + results.tsv
✅ Prompt / policy optimizer from successful cycles
✅ Role evolution based on benchmark performance
✅ Memory pruning via learned utility
✅ Cost-quality routing optimizer
✅ Fine-tuned planner / judge adapters from traces
✅ “Simulate before rollout” release gate
✅ Self-improvement proposals reviewed under the constitution
✅ Meta-critic for prompt drift detection
✅ Continuous adaptation without breaking auditability

Milestone: AutoOrg begins improving its own operating policy while remaining bounded by the constitution and approval system.







Phase 5 currently adds hierarchy, daemon mode, scheduling, approvals, and GitHub integration, but the approval gate is explicitly still a soft gate: a commit can exist locally and only then be marked pending. The doc also explicitly says the next move should be a hardening pass adding strict approval blocking, recovery after crash/restart, worker leases, issue→task translation, diff-based PR summaries, concurrency safety, subteam memory partitions, team budgets, and ULTRAPLAN SLAs. 
1

So below I’m treating Phase 5.1 as an additive hardening layer on top of your existing runtime/, integrations/, db/, and api/ layout. One architectural change is necessary: split ratchet decision from git materialization. Right now the ratchet logic commits immediately, and Phase 5 adds approval afterward; real strict blocking only works if “this deserves a commit” is separated from “write to git history now.” That’s my design inference from the current doc. 
1

AutoOrg — Phase 5.1: Operational Hardening
Strict Approval Blocking, Crash Recovery, Worker Leases, Concurrency Safety
WHAT PHASE 5.1 ADDS
text

Phase 5   ── Hierarchy + daemon + scheduler + soft approval gates + GitHub awareness

Phase 5.1 ── ┌──────────────────────────────────────────────────────────────┐
             │ Strict approval blocking: commit/push/merge impossible      │
             │ without an approved gate                                    │
             │ Crash recovery journal + resumable runs                     │
             │ Worker leases + heartbeat-based reclaim                     │
             │ Real job execution records (not just scheduled jobs)        │
             │ Workspace/repo concurrency locks                            │
             │ GitHub issue → org task translation                         │
             │ PR summaries from actual git diff                           │
             │ Per-team budgets + budget event tracking                    │
             │ Subteam-specific memory partitions                          │
             │ ULTRAPLAN SLAs: timeout, checkpoint, cancel, resume         │
             │ Incident log + recovery diagnostics                         │
             └──────────────────────────────────────────────────────────────┘
DIRECTORY ADDITIONS
text

src/
├── runtime/
│   ├── approval-enforcer.ts      ← strict approval blocking + materialization
│   ├── workspace-lock.ts         ← repo/workspace lease lock
│   ├── recovery-journal.ts       ← resumable checkpoints
│   ├── crash-recover.ts          ← recover interrupted runs after restart
│   ├── lease-manager.ts          ← worker leases + heartbeat + reclaim
│   ├── job-executor.ts           ← actually runs scheduled jobs
│   ├── budget-manager.ts         ← per-team USD/token/tool budgets
│   ├── memory-partitions.ts      ← per-team memory views and writes
│   ├── ultraplan-sla.ts          ← timeout/checkpoint/cancel wrapper
│   └── incident-log.ts           ← incidents + recovery diagnostics
├── prompts/
│   ├── issue-translator.ts       ← GitHub issue → delegated task prompt
│   ├── diff-summarizer.ts        ← summarize real git patch
│   └── recovery-analyst.ts       ← restart/resume diagnosis prompt
├── integrations/
│   ├── issue-translator.ts       ← translate issues into org tasks
│   └── diff-summarizer.ts        ← turn git diff into structured summary
├── db/
│   ├── schema-phase5_1.sql
│   └── migrate-phase5_1.ts
└── api/
    └── hardening-routes.ts       ← recovery, budgets, locks, issue tasks

artifacts/
├── approvals/
│   ├── pending/
│   └── materialized/
└── recovery/
    └── checkpoints/

memory/
└── partitions/
    ├── shared/
    └── <team-id>/
        ├── MEMORY.md
        └── facts/
1. Phase 5.1 DB schema