'use client';

import { useEffect, useState } from 'react';

interface PortfolioRun {
  id: string;
  mission_summary: string;
  status: string;
  initial_budget_usd: number;
  remaining_budget_usd: number;
  created_at: string;
}

export default function PortfolioPage() {
  const [runs, setRuns] = useState<PortfolioRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portfolio/runs')
      .then(res => res.json())
      .then(data => {
        setRuns(data);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Portfolio Orchestrator</h1>
          <p className="text-gray-400 text-sm mt-1">Manage concurrent organizational variants and capital allocation.</p>
        </div>
        <button className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-all">
          ✨ New Portfolio Mission
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
          <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Active Portfolio Value</div>
          <div className="text-3xl font-bold text-white font-mono">$1,250.00</div>
        </div>
        <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
          <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Total Variants Ran</div>
          <div className="text-3xl font-bold text-purple-400 font-mono">42</div>
        </div>
        <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
          <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Avg Synthesis Quality</div>
          <div className="text-3xl font-bold text-cyan-400 font-mono">0.892</div>
        </div>
      </div>

      <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 bg-white/5">
          <h2 className="text-sm font-bold text-white uppercase tracking-widest">Active & Recent Missions</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-gray-400 font-medium">
            <tr>
              <th className="px-6 py-4">Mission</th>
              <th className="px-6 py-4">Budget Progress</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Launched</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {runs.map((run) => (
              <tr key={run.id} className="hover:bg-white/5 transition-colors cursor-pointer">
                <td className="px-6 py-4">
                  <div className="font-bold text-white">{run.mission_summary}</div>
                  <div className="text-[10px] text-gray-500 font-mono">{run.id}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-purple-500" 
                        style={{ width: `${( (run.initial_budget_usd - run.remaining_budget_usd) / run.initial_budget_usd ) * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-400 font-mono">
                      ${(run.initial_budget_usd - run.remaining_budget_usd).toFixed(2)} / ${run.initial_budget_usd.toFixed(0)}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                   <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                     run.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                     run.status === 'running' ? 'bg-purple-500/20 text-purple-400 animate-pulse' :
                     'bg-red-500/20 text-red-400'
                   }`}>
                     {run.status}
                   </span>
                </td>
                <td className="px-6 py-4 text-right text-gray-400 font-mono text-[11px]">
                  {new Date(run.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {loading && <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-500 animate-pulse italic">Connecting to portfolio stream...</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
