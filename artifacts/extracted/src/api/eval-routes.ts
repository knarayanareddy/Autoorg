TypeScript

import { getDb } from '@/db/migrate.js';
import { BenchmarkRunner } from '@/evals/benchmark-runner.js';
import { ReplayLab } from '@/evals/replay-lab.js';
import { ConstitutionAB } from '@/evals/constitution-ab.js';
import { TemplateBakeoff } from '@/evals/template-bakeoff.js';
import { JudgeCalibrator } from '@/evals/judge-calibrator.js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handleEvalRoutes(url: URL, req: Request) {
  const method = req.method;

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

  if (url.pathname === '/api/benchmarks/run' && method === 'POST') {
    const body = await req.json() as {
      suiteName: string;
      constitutionVariant?: string;
      templateVariant?: string;
      modelMap?: Record<string, string>;
    };
    const runner = new BenchmarkRunner();
    const result = await runner.runSuite({
      suiteName: body.suiteName,
      constitutionVariant: body.constitutionVariant,
      templateVariant: body.templateVariant,
      modelMap: body.modelMap,
      mode: 'manual',
    });
    return json({ ok: true, result });
  }

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
      ORDER BY lb.updated_at DESC
      LIMIT 200
    `).all(suiteName, suiteName, type, type);

    db.close();
    return json(rows);
  }

  if (url.pathname === '/api/regressions' && method === 'GET') {
    const runId = url.searchParams.get('benchmarkRunId');
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM regression_alarms
      ${runId ? 'WHERE benchmark_run_id = ?' : ''}
      ORDER BY created_at DESC
      LIMIT 200
    `).all(...(runId ? [runId] : []));
    db.close();
    return json(rows);
  }

  if (url.pathname === '/api/replay' && method === 'POST') {
    const body = await req.json() as { attemptId: string; mode?: 'artifact_only' | 'tool_trace' | 'full_score_recompute' };
    const lab = new ReplayLab();
    const result = await lab.replayAttempt(body);
    return json({ ok: true, result });
  }

  if (url.pathname === '/api/constitution-ab' && method === 'POST') {
    const body = await req.json() as {
      suiteName: string;
      variantA: string;
      variantB: string;
      templateVariant?: string;
      modelMap?: Record<string, string>;
    };
    const ab = new ConstitutionAB();
    const result = await ab.compare(body);
    return json({ ok: true, result });
  }

  if (url.pathname === '/api/template-bakeoff' && method === 'POST') {
    const body = await req.json() as {
      suiteName: string;
      templateA: string;
      templateB: string;
      constitutionVariant?: string;
      modelMap?: Record<string, string>;
    };
    const bakeoff = new TemplateBakeoff();
    const result = await bakeoff.compare(body);
    return json({ ok: true, result });
  }

  if (url.pathname === '/api/judge-calibrate' && method === 'POST') {
    const body = await req.json() as { benchmarkRunId: string; judgeModel?: string };
    const calibrator = new JudgeCalibrator();
    const result = await calibrator.calibrate(body);
    return json({ ok: true, result });
  }

  return null;
}
20. Minimal UI additions
text

web/app/
├── benchmarks/page.tsx
├── leaderboard/page.tsx
├── regressions/page.tsx
└── replay/page.tsx
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
</nav>
/benchmarks page
Show:

recent benchmark runs
suite name
mode
constitution/template variant
pass/fail summary
start/finish time
trigger new run button
/leaderboard page
Show:

per-suite leaderboards
model rankings
template rankings
constitution rankings
pass rate / score / cost / latency
/regressions page
Show:

new alarms
metric
baseline vs current
severity
LLM explanation
jump-to-run
/replay page
Show:

replay sessions
source attempt/run
mode
link to replay artifact
21. Judge-aware benchmark scoring integration
Patch src/runtime/ratchet.ts
Expand score input to accept benchmark context if present:

TypeScript

async score(input: {
  proposal: Proposal;
  graph: KnowledgeGraph;
  verificationReport?: any;
  evidencePackId?: string;
  toolStats?: { toolCalls: number };
  policyReport?: any;
  provenanceReport?: any;
  benchmarkCase?: {
    caseName: string;
    category: string;
    difficulty: string;
  };
}): Promise<RatchetScore> {
  const judgeOutput = await AgentRunner.run('RatchetJudge', {
    proposal: input.proposal,
    constitution: this.constitution,
    graph: input.graph,
    verificationReport: input.verificationReport,
    evidencePackId: input.evidencePackId,
    toolStats: input.toolStats,
    policyReport: input.policyReport,
    provenanceReport: input.provenanceReport,
    benchmarkCase: input.benchmarkCase,
    model: 'claude-opus-4',
  });
  return judgeOutput as RatchetScore;
}
Patch roles/RatchetJudge.md
Add:

Markdown

## PHASE 7 BENCHMARKING ADDENDUM
- When benchmarkCase metadata is present, score the output against the case’s mission demands, not generic quality alone.
- Do not over-reward novelty if it reduces benchmark fitness.
- Distinguish benchmark fitness from free-form creativity.
- Be stable: similar outputs on the same benchmark should receive similar scores.
22. Regression alarms into incident log
Patch src/evals/regression-detector.ts
After inserting regression alarm, also log to incident log if you want dashboard visibility:

TypeScript

import { IncidentLog } from '@/runtime/incident-log.js';

const incidents = new IncidentLog();

incidents.log({
  severity: severity === 'critical' ? 'critical' : severity === 'error' ? 'error' : 'warn',
  component: 'benchmark-regression',
  summary: `Regression detected: ${metricName}`,
  details: {
    benchmarkRunId,
    baselineValue,
    currentValue,
    deltaValue,
  },
});
This makes benchmark regressions visible in the existing ops/debug surface.

23. CI example