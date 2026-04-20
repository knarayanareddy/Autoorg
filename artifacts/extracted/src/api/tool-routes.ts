TypeScript

import { getDb } from '@/db/migrate.js';
import { ToolReplay } from '@/tools/replay.js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handleToolRoutes(url: URL, req: Request) {
  const method = req.method;

  if (url.pathname === '/api/tools' && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`SELECT * FROM tool_definitions ORDER BY name ASC`).all();
    db.close();
    return json(rows);
  }

  if (url.pathname === '/api/tool-executions' && method === 'GET') {
    const runId = url.searchParams.get('runId');
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM tool_executions
      ${runId ? 'WHERE run_id = ?' : ''}
      ORDER BY created_at DESC
      LIMIT 200
    `).all(...(runId ? [runId] : []));
    db.close();
    return json(rows);
  }

  if (url.pathname === '/api/evidence-packs' && method === 'GET') {
    const runId = url.searchParams.get('runId');
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM evidence_packs
      ${runId ? 'WHERE run_id = ?' : ''}
      ORDER BY created_at DESC
      LIMIT 200
    `).all(...(runId ? [runId] : []));
    db.close();
    return json(rows);
  }

  const match = url.pathname.match(/^\/api\/tool-executions\/([^/]+)\/replay$/);
  if (match && method === 'POST') {
    const executionId = match[1];
    const body = await req.json().catch(() => ({})) as { mode?: 'artifact_only' | 'full_rerun' };
    const replay = new ToolReplay();
    const result = await replay.replay(executionId, body.mode ?? 'artifact_only');
    return json({ ok: true, result });
  }

  return null;
}
21. Minimal UI additions
text

web/app/
├── tools/page.tsx
└── evidence/page.tsx
Patch web/app/layout.tsx
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
</nav>
/tools page should show
registered tools
recent executions
denied calls
duration / cost / source count
replay button
/evidence page should show
evidence packs by cycle
item counts
unsupported claim counts
owner role
link to markdown artifact
22. Transcript integration
Patch your transcript writer
Whenever a tool executes, append trace events:

JSON

{
  "ts": "2026-04-08T12:00:00Z",
  "type": "tool_call",
  "role": "Engineer",
  "tool_name": "repo.search",
  "execution_id": "tx_abc123",
  "task_id": "task_xyz",
  "input": { "query": "ApprovalEnforcer" }
}
and later:

JSON

{
  "ts": "2026-04-08T12:00:02Z",
  "type": "tool_result",
  "execution_id": "tx_abc123",
  "summary": "Found 4 repo matches",
  "source_count": 4,
  "artifact_path": "artifacts/tools/outputs/tx_abc123.json"
}
This gives you replayable and inspectable traces in both:

SQLite
artifacts
transcript history
23. Phase 6 tests
tests/tool-policy.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { ToolPolicy } from '../src/tools/tool-policy.js';

describe('ToolPolicy', () => {
  it('seeds defaults and allows engineer repo search', () => {
    const runId = `run_tp_${Date.now()}`;
    const p = new ToolPolicy(runId);
    p.seedDefaults();
    expect(p.isAllowed({ role: 'Engineer', toolName: 'repo.search' })).toBe(true);
    expect(p.isAllowed({ role: 'Engineer', toolName: 'web.fetch' })).toBe(false);
  });
});
tests/tool-runner.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { bootstrapRegistry } from '../src/tools/bootstrap.js';
import { ToolRunner } from '../src/tools/tool-runner.js';
import { ToolPolicy } from '../src/tools/tool-policy.js';

describe('ToolRunner', () => {
  it('executes an allowed repo.search tool', async () => {
    const runId = `run_tr_${Date.now()}`;
    const registry = bootstrapRegistry();
    const policy = new ToolPolicy(runId);
    policy.seedDefaults();

    const runner = new ToolRunner(runId, registry);
    const result = await runner.execute('repo.search', { query: 'AutoOrg' }, {
      runId,
      cycleNumber: 1,
      role: 'Engineer',
    });

    expect(result.executionId).toMatch(/^tx_/);
    expect(typeof result.summary).toBe('string');
  });
});
tests/evidence-pack.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { EvidencePackBuilder } from '../src/tools/evidence-pack.js';

describe('EvidencePackBuilder', () => {
  it('creates a pack from execution ids', async () => {
    const builder = new EvidencePackBuilder('run_ep_test');
    const pack = await builder.fromExecutions({
      cycleNumber: 1,
      ownerRole: 'Engineer',
      kind: 'worker',
      executionIds: [],
      summary: 'empty pack test',
    });

    expect(pack.packId).toMatch(/^ep_/);
  });
});
tests/sandbox.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { Sandbox } from '../src/tools/sandbox.js';

describe('Sandbox', () => {
  it('rejects non-allowlisted commands', async () => {
    const s = new Sandbox();
    await expect(s.exec('rm -rf /', { cwd: process.cwd(), timeoutMs: 1000 })).rejects.toThrow();
  });
});
tests/replay.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { ToolReplay } from '../src/tools/replay.js';

describe('ToolReplay', () => {
  it('fails clearly for missing execution', async () => {
    const replay = new ToolReplay();
    await expect(replay.replay('missing_id')).rejects.toThrow();
  });
});
tests/tool-planner-schema.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { ToolPlanSchema } from '../src/prompts/tool-planner.js';

describe('ToolPlanSchema', () => {
  it('validates a tool plan', () => {
    const parsed = ToolPlanSchema.parse({
      needs_tools: true,
      goal: 'Inspect approval flow',
      tool_calls: [
        {
          tool_name: 'repo.search',
          why: 'Need to find approval logic',
          claim_to_verify: 'Where commits are materialized',
          args: { query: 'materializeApprovedActions' },
        },
      ],
      fallback_answer_if_denied: 'I need repo search access to answer safely.',
    });

    expect(parsed.tool_calls.length).toBe(1);
  });
});
24. Run instructions for Phase 6
Bash

# 1. Apply migrations
bun run src/db/migrate-phase6.ts

# 2. Start daemon
bun run src/runtime/daemon.ts

# 3. Start API
bun run src/api/server.ts

# 4. Start dashboard
cd web && bun run dev

# 5. Start orchestrator
bun start

# 6. Inspect tools
curl http://localhost:3000/api/tools

# 7. Inspect tool traces
curl "http://localhost:3000/api/tool-executions?runId=run_..."

# 8. Inspect evidence packs
curl "http://localhost:3000/api/evidence-packs?runId=run_..."
25. Optional .env additions for Phase 6
Bash

# ── TOOL SYSTEM ──────────────────────────────────────────────
AUTOORG_TOOLS_ENABLED=1
TOOL_MAX_CALLS_PER_CYCLE=6
TOOL_MAX_OUTPUT_CHARS=12000

# ── SANDBOX ─────────────────────────────────────────────────
SANDBOX_ALLOWED_PREFIXES=bun test,bun run,node,python,pytest,tsc,eslint,prettier,git diff,git status
SANDBOX_DEFAULT_TIMEOUT_MS=20000

# ── CONNECTORS ──────────────────────────────────────────────
WEB_FETCH_ENABLED=1
GITHUB_SEARCH_ENABLED=1
LOCAL_DOCS_ROOT=memory

# ── EVIDENCE / REPLAY ───────────────────────────────────────
EVIDENCE_PACK_MAX_CHARS=20000
TOOL_TRACE_ARTIFACT_DIR=artifacts/tools
EVIDENCE_ARTIFACT_DIR=artifacts/evidence
26. What Phase 6 now gives you
At this point AutoOrg can:

text

✅ Decide when a task needs verification before answering
✅ Inspect the repo instead of guessing about it
✅ Read local docs and memory files as tools
✅ Search GitHub issues/PRs as part of org work
✅ Fetch external web pages for verification
✅ Execute bounded commands in a sandbox
✅ Persist every tool call as a structured trace
✅ Turn tool outputs into evidence packs
✅ Make the Critic attack unsupported claims explicitly
✅ Clamp groundedness when claims are not backed by evidence
✅ Replay tool traces later for debugging and evals
This is the phase where AutoOrg stops being only a debating organization and becomes a verifying and acting organization.

27. My recommended implementation order
Do Phase 6 in this order:

DB migration
registry + manifests
tool policy
tool runner
evidence packs
AgentRunner integration
verification clamp
API/UI
sandbox exec last
Why:

the safe read/search tools give immediate value,
the evidence pipeline creates auditability,
sandbox execution is the highest-risk part, so do it after traces and policy gates exist.





here is Phase 6.1 expanded in the same detailed file-by-file / migration / prompt / runtime style.

This phase sits directly on top of Phase 6. Phase 6 gave AutoOrg the ability to use tools, build evidence packs, trace tool executions, and clamp groundedness when claims are unsupported. Phase 6.1 is the hardening layer that makes those actions policy-governed, reversible, attributable, signed, redactable, and auditable.

AutoOrg — Phase 6.1: Safety + Provenance Hardening
Policy Engine, Reversible Action Ledger, Provenance Chain, Signed Artifacts, Redaction, Risk-Tiered Approvals
WHAT PHASE 6.1 ADDS
text

Phase 6   ── Tool registry + tool traces + evidence packs + verification clamp

Phase 6.1 ── ┌──────────────────────────────────────────────────────────────┐
             │ Policy engine for READ / PROPOSE / PATCH / EXECUTE / PUBLISH│
             │ Reversible action ledger with compensation records           │
             │ Claim → citation → graph/source/seed provenance chain        │
             │ Signed run manifests + immutable artifact metadata           │
             │ Secret redaction + PII filters in transcripts/memory/artifacts│
             │ Risk-tiered approvals for high-risk actions                  │
             │ Unsafe-action detector before dangerous execution/publish     │
             │ Judge-side policy compliance score + compliance clamp         │
             │ Security findings registry + exportable audit bundle         │
             │ Sandbox escape tests + permission fuzzing harness            │
             └──────────────────────────────────────────────────────────────┘
DIRECTORY ADDITIONS
text

src/
├── runtime/
│   ├── policy-engine.ts           ← action policy evaluation
│   ├── risk-engine.ts             ← low/medium/high/critical risk inference
│   ├── action-ledger.ts           ← append-only reversible action log
│   ├── provenance.ts              ← claim/citation/provenance linker
│   ├── artifact-signing.ts        ← SHA256 + HMAC signatures
│   ├── immutable-artifacts.ts     ← write-once artifact writer + metadata
│   ├── redaction.ts               ← secret + PII redaction filters
│   ├── safety-review.ts           ← unsafe-action detection before actuation
│   ├── policy-auditor.ts          ← policy compliance scoring per cycle
│   └── security-audit.ts          ← findings + export bundle
├── prompts/
│   ├── unsafe-action-detector.ts  ← structured risky-action review
│   ├── provenance-linker.ts       ← draft claims → evidence labels
│   └── policy-auditor.ts          ← compliance score + violation analysis
├── db/
│   ├── schema-phase6_1.sql
│   └── migrate-phase6_1.ts
└── api/
    └── security-routes.ts         ← action ledger, findings, provenance, export

artifacts/
├── manifests/
├── signed/
├── security/
│   ├── findings/
│   └── audits/
└── provenance/
    └── reports/
1. Phase 6.1 DB schema