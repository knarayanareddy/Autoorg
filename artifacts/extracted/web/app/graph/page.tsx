React

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AgentGraph } from '@/components/AgentGraph';
import { GraphSearch } from '@/components/GraphSearch';
import { GraphDiff } from '@/components/GraphDiff';

interface GraphNode {
  node_id: string;
  label: string;
  node_type: string;
  properties_json?: string;
}

interface GraphEdge {
  id: string;
  from_node_id: string;
  to_node_id: string;
  rel_type: string;
  weight: number;
}

interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  build?: {
    id?: string;
    node_count: number;
    edge_count: number;
    build_type: string;
    created_at: string;
  };
}

interface Snapshot {
  id: string;
  build_id: string;
  label: string;
  node_count: number;
  edge_count: number;
  created_at: string;
}

interface DiffPayload {
  addedNodes: Array<{ node_id: string; label: string; node_type: string }>;
  removedNodes: Array<{ node_id: string; label: string; node_type: string }>;
  addedEdges: Array<{ edge_id: string; from_node_id: string; to_node_id: string; rel_type: string }>;
  removedEdges: Array<{ edge_id: string; from_node_id: string; to_node_id: string; rel_type: string }>;
}

export default function GraphPage() {
  const [payload, setPayload] = useState<GraphPayload | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [before, setBefore] = useState<string>('');
  const [after, setAfter] = useState<string>('');
  const [diff, setDiff] = useState<DiffPayload | null>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const runs = await fetch('/api/runs').then(r => r.json()) as Array<{ id: string }>;
      if (!runs.length) return;

      const id = runs[0]!.id;
      setRunId(id);

      const [graph, snaps] = await Promise.all([
        fetch(`/api/runs/${id}/graph`).then(r => r.json()) as Promise<GraphPayload>,
        fetch(`/api/runs/${id}/graph/snapshots`).then(r => r.json()) as Promise<Snapshot[]>,
      ]);

      setPayload(graph);
      setSnapshots(snaps);

      if (snaps.length >= 2) {
        setAfter(snaps[0]!.id);
        setBefore(snaps[1]!.id);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!runId || !before || !after) return;
      const d = await fetch(`/api/runs/${runId}/graph/diff?before=${before}&after=${after}`).then(r => r.json()) as DiffPayload;
      setDiff(d);
    })();
  }, [runId, before, after]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Knowledge Graph</h1>
          <p className="text-gray-500 text-sm mt-1">
            GraphRAG grounding for AutoOrg outputs.
          </p>
        </div>

        {runId && (
          <div className="flex gap-2">
            <a
              href={`/api/runs/${runId}/graph/export?format=json`}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 px-3 py-2 rounded text-sm"
            >
              Export JSON
            </a>
            <a
              href={`/api/runs/${runId}/graph/export?format=graphml`}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 px-3 py-2 rounded text-sm"
            >
              Export GraphML
            </a>
          </div>
        )}
      </div>

      {payload?.build && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500">Nodes</div>
            <div className="text-2xl font-bold text-cyan-400">{payload.build.node_count}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500">Edges</div>
            <div className="text-2xl font-bold text-green-400">{payload.build.edge_count}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500">Latest Build Type</div>
            <div className="text-xl font-bold text-yellow-400">{payload.build.build_type}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500">Snapshots</div>
            <div className="text-2xl font-bold text-purple-400">{snapshots.length}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GraphSearch
          runId={runId}
          onSelect={(nodeId) => router.push(`/graph/${nodeId}`)}
        />

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 lg:col-span-2">
          <h3 className="text-sm font-bold text-gray-400 mb-3">Snapshot Diff Controls</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select
              value={before}
              onChange={(e) => setBefore(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
            >
              <option value="">Before snapshot</option>
              {snapshots.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label} · {new Date(s.created_at).toLocaleString()}
                </option>
              ))}
            </select>

            <select
              value={after}
              onChange={(e) => setAfter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
            >
              <option value="">After snapshot</option>
              {snapshots.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label} · {new Date(s.created_at).toLocaleString()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {payload ? (
        <AgentGraph
          nodes={payload.nodes}
          edges={payload.edges}
          onNodeClick={(nodeId) => router.push(`/graph/${nodeId}`)}
        />
      ) : (
        <div className="text-gray-600">Loading graph...</div>
      )}

      <GraphDiff diff={diff} />
    </div>
  );
}
12. Tests
tests/groundedness-validator.test.ts
TypeScript

import { describe, it, expect, beforeAll } from 'bun:test';
import { getDb } from '../src/db/migrate.js';
import {
  validateGroundednessDeterministic,
} from '../src/graph/groundedness-validator.js';

const RUN_ID = `gv_test_${Date.now()}`;

describe('deterministic groundedness validator', () => {
  beforeAll(() => {
    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS graph_node_cache (
        node_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        label TEXT NOT NULL,
        node_type TEXT NOT NULL,
        properties_json TEXT NOT NULL DEFAULT '{}',
        embedding BLOB,
        updated_at DATETIME DEFAULT (datetime('now'))
      )
    `);

    db.prepare(`
      INSERT OR REPLACE INTO graph_node_cache
        (node_id, run_id, label, node_type, properties_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'n_ab12cd34ef',
      RUN_ID,
      'OpenAI',
      'Entity',
      '{}'
    );
    db.close();
  });

  it('marks cited valid claims as grounded', () => {
    const report = validateGroundednessDeterministic(
      RUN_ID,
      'OpenAI released a system. [n_ab12cd34ef]'
    );
    expect(report.totalClaims).toBeGreaterThan(0);
    expect(report.validCitedClaims).toBe(1);
    expect(report.validCoverage).toBeGreaterThan(0);
  });

  it('marks invalid refs correctly', () => {
    const report = validateGroundednessDeterministic(
      RUN_ID,
      'This claim cites a fake node. [n_deadbeef00]'
    );
    expect(report.invalidCitedClaims).toBe(1);
    expect(report.invalidRefs).toContain('n_deadbeef00');
  });

  it('marks uncited claims correctly', () => {
    const report = validateGroundednessDeterministic(
      RUN_ID,
      'This is an uncited claim about the system.'
    );
    expect(report.uncitedClaims).toBe(1);
  });
});
tests/graph-snapshots.test.ts
TypeScript

import { describe, it, expect, beforeAll } from 'bun:test';
import { getDb } from '../src/db/migrate.js';
import { snapshotGraphState, listGraphSnapshots, diffGraphSnapshots } from '../src/graph/snapshots.js';

const RUN_ID = `gsnap_test_${Date.now()}`;

describe('graph snapshots', () => {
  beforeAll(() => {
    const db = getDb();

    db.exec(`
      CREATE TABLE IF NOT EXISTS graph_snapshots (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        build_id TEXT NOT NULL,
        label TEXT NOT NULL,
        node_count INTEGER DEFAULT 0,
        edge_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS graph_snapshot_nodes (
        snapshot_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        label TEXT NOT NULL,
        node_type TEXT NOT NULL,
        properties_json TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (snapshot_id, node_id)
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS graph_snapshot_edges (
        snapshot_id TEXT NOT NULL,
        edge_id TEXT NOT NULL,
        from_node_id TEXT NOT NULL,
        to_node_id TEXT NOT NULL,
        rel_type TEXT NOT NULL,
        weight REAL DEFAULT 1.0,
        properties_json TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (snapshot_id, edge_id)
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS graph_node_cache (
        node_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        label TEXT NOT NULL,
        node_type TEXT NOT NULL,
        properties_json TEXT NOT NULL DEFAULT '{}',
        embedding BLOB,
        updated_at DATETIME DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS graph_edge_cache (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        from_node_id TEXT NOT NULL,
        to_node_id TEXT NOT NULL,
        rel_type TEXT NOT NULL,
        weight REAL DEFAULT 1.0,
        properties_json TEXT NOT NULL DEFAULT '{}',
        updated_at DATETIME DEFAULT (datetime('now'))
      )
    `);

    db.prepare(`
      INSERT OR REPLACE INTO graph_node_cache (node_id, run_id, label, node_type, properties_json)
      VALUES ('n1', ?, 'OpenAI', 'Entity', '{}')
    `).run(RUN_ID);

    db.close();
  });

  it('creates snapshots and diffs them', async () => {
    const s1 = await snapshotGraphState(RUN_ID, 'gb_1', 'initial');

    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO graph_node_cache (node_id, run_id, label, node_type, properties_json)
      VALUES ('n2', ?, 'Groundedness', 'Concept', '{}')
    `).run(RUN_ID);
    db.close();

    const s2 = await snapshotGraphState(RUN_ID, 'gb_2', 'update');

    const diff = diffGraphSnapshots(s1, s2);
    expect(diff.addedNodes.length).toBe(1);

    const list = listGraphSnapshots(RUN_ID);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });
});
13. How groundedness now works after Phase 4.1
After these patches:

Engineer output
can cite graph nodes
is deterministically checked
if coverage is weak, Critic gets a synthetic graph-grounding objection
Critic
explicitly lists uncited claims / invalid refs
raises deterministic objections if grounding is weak
Judge
sees deterministic groundedness report
cannot score groundedness above actual valid citation coverage
recomputes composite after clamp
So groundedness is no longer “just vibes from an LLM judge.”
It becomes a hybrid deterministic + LLM metric.

14. Run sequence for Phase 4.1
Bash

# 1. Apply migration
bun run src/db/migrate-phase4_1.ts

# 2. Start orchestrator
bun start

# 3. Start API
bun run src/api/server.ts

# 4. Start dashboard
cd web && bun run dev
15. What Phase 4.1 hardening gives you
You now have:

deterministic claim validation
citation-quality-aware Critic
groundedness-clamped Judge
graph snapshots
graph diffs
graph export
graph search UI
This is a serious step up in reliability.

If you want, the next logical step is Phase 5, where we do:

multi-agent coordinator hierarchy
subteams / department heads
ULTRAPLAN-style deep planning mode
background daemon mode
cron / always-on runs
human approval gates for commits
PR/comment/webhook integrations



Phase 5 is where AutoOrg stops feeling like “a single loop with a few agents” and starts feeling like an actual autonomous organization.

This phase adds:

hierarchical coordination
subteams / department leads
ULTRAPLAN-style deep planning
persistent daemon mode
cron / scheduled runs
human approval gates
GitHub webhook / PR integrations
This is the phase that turns AutoOrg into something you can run in the background all day, or all week.

🔬 AutoOrg — Phase 5: Hierarchical Coordination, Daemon Mode, Approval Gates, Integrations
WHAT PHASE 5 ADDS
text

Phase 4.1 ── GraphRAG + deterministic groundedness + graph snapshots
Phase 5   ── ┌──────────────────────────────────────────────────────────────┐
             │  Coordinator hierarchy (CEO → Department Leads → Workers)   │
             │  Subteams / departments with delegated missions              │
             │  ULTRAPLAN deep-planning mode                               │
             │  Persistent daemon mode (survives terminal close)           │
             │  Cron scheduler / always-on background runs                 │
             │  Approval gates before commit / push / merge                │
             │  GitHub webhook ingestion + issue/PR awareness              │
             │  GitHub PR draft generation / comment posting               │
             │  API for approvals, daemon control, job scheduling          │
             │  Stateful background service with sqlite-backed jobs        │
             └──────────────────────────────────────────────────────────────┘
DIRECTORY ADDITIONS
text

src/
├── runtime/
│   ├── coordinator.ts          ← hierarchical orchestration
│   ├── team-manager.ts         ← department/subteam creation + lifecycle
│   ├── ultraplan.ts            ← long-running deep planner
│   ├── daemon.ts               ← persistent background process
│   ├── scheduler.ts            ← cron/scheduled jobs
│   ├── approval-gate.ts        ← human approval checkpoints
│   └── service-state.ts        ← persistent daemon state
├── prompts/
│   ├── coordinator-lead.ts     ← subteam lead prompt
│   └── ultraplan.ts            ← deep planner prompt
├── integrations/
│   ├── github.ts               ← GitHub API helper
│   ├── webhooks.ts             ← webhook router / verifier
│   └── pr-writer.ts            ← PR draft/comment generation
├── db/
│   ├── schema-phase5.sql
│   └── migrate-phase5.ts
└── api/
    └── daemon-routes.ts        ← approval/scheduler/daemon route helpers
1. Phase 5 DB schema