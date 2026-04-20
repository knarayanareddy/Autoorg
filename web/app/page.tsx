'use client';

import { useState, useEffect, useCallback } from 'react';
import { ScoreChart }       from '@/components/ScoreChart';
import { ObjectionTracker } from '@/components/ObjectionTracker';
import { CostBreakdown }    from '@/components/CostBreakdown';
import { MailboxFeed }      from '@/components/MailboxFeed';
import { ApprovalCenter }   from '@/components/ApprovalCenter';
import { ToolTraces }       from '@/components/ToolTraces';
import { SecurityFindings } from '@/components/SecurityFindings';

// ── Types ──────────────────────────────────────────────────────────────
interface RunSummary {
  run: {
    id: string; status: string; total_cycles: number;
    best_score: number; total_cost_usd: number;
    started_at: string; stop_reason: string | null;
  };
  scoreHistory:    Array<{ cycle_number: number; composite: number; decision: string }>;
  costByRole:      Array<{ agent_role: string; total_cost: number; total_tokens: number; exec_count: number }>;
  openObjections:  Array<{ id: string; severity: string; description: string; proposed_fix: string; cycle_raised: number; resolved: number }>;
  latestCycle:     { cycle_number: number; decision: string | null; score_composite: number | null; duration_ms: number | null } | null;
}

interface LiveEvent {
  type:     string;
  cycle?:   number;
  phase?:   string;
  score?:   { composite: number };
  newBest?: number;
  [key: string]:  unknown;
}

// ── Stat card ──────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'text-white' }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-600 mt-1">{sub}</div>}
    </div>
  );
}

// ── Live event badge ───────────────────────────────────────────────────
function LiveBadge({ event }: { event: LiveEvent | null }) {
  if (!event) return null;

  const messages: Record<string, string> = {
    cycle_start:  `🔄 Cycle ${event.cycle} started`,
    phase_change: `⚙️  Phase: ${event.phase}`,
    agent_start:  `🤖 Agent running`,
    scored:       `⚖️  Score: ${(event.score?.composite ?? 0).toFixed(4)}`,
    committed:    `✅ COMMIT → ${(event.newBest ?? 0).toFixed(4)}`,
    reverted:     `↩️  REVERT`,
    dream_start:  `💤 autoDream running`,
    run_complete: `🏁 Run complete`,
    error:        `✗ Error`,
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-xs text-cyan-400 animate-pulse">
      {messages[event.type] ?? event.type}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD PAGE
// ══════════════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const [runId,       setRunId]       = useState<string | null>(null);
  const [summary,     setSummary]     = useState<RunSummary | null>(null);
  const [liveEvent,   setLiveEvent]   = useState<LiveEvent | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [activityLog, setActivityLog] = useState<string[]>([]);
  const [daemonStatus, setDaemonStatus] = useState<{ status: string; pid: number } | null>(null);

  // ── Fetch latest run ───────────────────────────────────────────────
  const fetchLatestRun = useCallback(async () => {
    try {
      const runs = await fetch('/api/runs').then(r => r.json()) as Array<{ id: string }>;
      if (runs.length > 0 && runs[0]) {
        const id   = runs[0].id;
        setRunId(id);
        const data = await fetch(`/api/runs/${id}`).then(r => r.json()) as RunSummary;
        setSummary(data);
      }
    } catch (err) {
      console.error('Failed to fetch run:', err);
    }
  }, []);

  useEffect(() => { fetchLatestRun(); }, [fetchLatestRun]);

  // ── WebSocket connection ────────────────────────────────────────────
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3001');

    ws.onopen = () => {
      setWsConnected(true);
      console.log('[WS] Connected');
    };

    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as LiveEvent;
        setLiveEvent(event);

        // Add to activity log
        const ts = new Date().toLocaleTimeString('en', { hour12: false });
        setActivityLog(prev => [
          `${ts} ${event.type}${event.cycle ? ` [C${event.cycle}]` : ''}`,
          ...prev,
        ].slice(0, 20));

        // Refresh summary on key events
        if (['committed', 'reverted', 'run_complete', 'dream_done'].includes(event.type)) {
          fetchLatestRun();
        }
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      setWsConnected(false);
      console.log('[WS] Disconnected');
    };

    return () => ws.close();
  }, [fetchLatestRun]);

  // ── Poll for updates every 10s ─────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLatestRun();
      fetch('/api/daemon').then(r => r.json()).then(setDaemonStatus).catch(() => {});
    }, 10_000);
    return () => clearInterval(interval);
  }, [fetchLatestRun]);

  const run     = summary?.run;
  const commits = summary?.scoreHistory.filter(s => s.decision === 'COMMIT').length ?? 0;
  const reverts = summary?.scoreHistory.filter(s => s.decision === 'REVERT').length ?? 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">God's-Eye View</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {run ? `Run: ${run.id}` : 'No run found'}{' '}
            {run?.status === 'running'
              ? <span className="text-green-400 animate-pulse">● LIVE</span>
              : <span className="text-gray-600">● {run?.status ?? 'idle'}</span>
            }
          </p>
        </div>

        <div className="flex items-center gap-3">
          {daemonStatus && (
            <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 border ${
              daemonStatus.status === 'running' 
                ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                : 'bg-gray-800 text-gray-500 border-gray-700'
            }`}>
              {daemonStatus.status === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" />}
              Daemon: {daemonStatus.status}
            </div>
          )}
          <LiveBadge event={liveEvent} />
          <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
          <span className="text-xs text-gray-500">{wsConnected ? 'Live' : 'Disconnected'}</span>
        </div>
      </div>

      {/* ── Approval Center (Phase 5) ── */}
      <ApprovalCenter />

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard label="Best Score"   value={run ? `${(run.best_score * 100).toFixed(1)}%`   : '—'} color="text-cyan-400" />
        <StatCard label="Cycles"       value={run ? String(run.total_cycles) : '—'} sub={`of ${summary?.run ? JSON.parse((summary as unknown as { run: { config_json?: string } }).run.config_json ?? '{}').maxCycles ?? '?' : '?'}`} />
        <StatCard label="Commits"      value={String(commits)} color="text-green-400" sub={`${reverts} reverts`} />
        <StatCard label="Total Cost"   value={run ? `$${run.total_cost_usd.toFixed(4)}` : '$0.00'} color="text-yellow-400" />
        <StatCard label="Open Objects" value={String(summary?.openObjections.length ?? 0)} color={(summary?.openObjections.length ?? 0) > 0 ? 'text-red-400' : 'text-green-400'} />
        <StatCard label="Status"       value={run?.status ?? 'idle'} color={run?.status === 'running' ? 'text-green-400' : 'text-gray-400'} />
      </div>

      {/* ── Score chart (full width) ── */}
      <ScoreChart data={summary?.scoreHistory ?? []} width={900} height={200} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
            <ToolTraces runId={runId ?? undefined} />
        </div>
        <div className="md:col-span-2">
            <SecurityFindings runId={runId ?? undefined} />
        </div>
      </div>

      {/* ── Three column layout ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ObjectionTracker objections={summary?.openObjections ?? []} />
        <CostBreakdown    data={summary?.costByRole ?? []} />

        {/* Activity log */}
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <h3 className="text-sm font-bold text-gray-400 mb-3">📋 Live Activity</h3>
          <div className="space-y-0.5 max-h-64 overflow-y-auto font-mono text-xs">
            {activityLog.length === 0
              ? <p className="text-gray-600">Waiting for events...</p>
              : activityLog.map((line, i) => (
                <div key={i} className={`text-gray-${i === 0 ? '300' : '600'}`}>
                  {line}
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* ── Cycle history table ── */}
      {summary && summary.scoreHistory.length > 0 && (
        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <h3 className="text-sm font-bold text-gray-400">Cycle History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Cycle', 'Score', 'G', 'N', 'C', 'A', 'Decision'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-gray-500 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...summary.scoreHistory].reverse().slice(0, 15).map(row => (
                  <tr key={row.cycle_number} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-2 text-gray-400">{row.cycle_number}</td>
                    <td className="px-4 py-2 font-bold text-white">{(row.composite * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2 text-gray-500">—</td>
                    <td className="px-4 py-2 text-gray-500">—</td>
                    <td className="px-4 py-2 text-gray-500">—</td>
                    <td className="px-4 py-2 text-gray-500">—</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        row.decision === 'COMMIT'  ? 'bg-green-900 text-green-300' :
                        row.decision === 'REVERT'  ? 'bg-red-900 text-red-300' :
                        'bg-gray-800 text-gray-400'
                      }`}>
                        {row.decision}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── No data state ── */}
      {!run && (
        <div className="text-center py-20 text-gray-600">
          <div className="text-4xl mb-4">🔬</div>
          <p className="text-lg">No AutoOrg run found.</p>
          <p className="text-sm mt-2">
            Start a run: <code className="text-cyan-400">bun start</code>
          </p>
          <p className="text-sm mt-1">
            Start API server: <code className="text-cyan-400">bun run src/api/server.ts</code>
          </p>
        </div>
      )}
    </div>
  );
}
