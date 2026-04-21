'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { SecurityFindings } from '@/components/SecurityFindings';
import { ToolTraces } from '@/components/ToolTraces';
import { CostBreakdown } from '@/components/CostBreakdown';
import dynamic from 'next/dynamic';

const GraphVisualization = dynamic(() => import('@/components/GraphVisualization'), { ssr: false });

type TabType = 'overview' | 'security' | 'logistics' | 'graph';

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.id as string;
  const [data, setData] = useState<any>(null);
  const [pivots, setPivots] = useState<any[]>([]);
  const [debt, setDebt] = useState<any[]>([]);
  const [costs, setCosts] = useState<any[]>([]);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [objectives, setObjectives] = useState({ quality: 1.0, cost: 1.0, speed: 1.0 });

  useEffect(() => {
    // Polling for run data
    const interval = setInterval(() => {
      fetch(`/api/runs/${runId}`).then(res => res.json()).then(setData);
      fetch(`/api/runs/${runId}/pivots`).then(res => res.json()).then(setPivots);
      fetch(`/api/runs/${runId}/debt`).then(res => res.json()).then(setDebt);
      fetch(`/api/runs/${runId}/costs`).then(res => res.json()).then(setCosts);
      fetch(`/api/runs/${runId}/graph`).then(res => res.json()).then(setGraphData);
    }, 3000);
    return () => clearInterval(interval);
  }, [runId]);

  const updateObjective = (type: string, value: number) => {
    const next = { ...objectives, [type]: value };
    setObjectives(next);
    fetch(`/api/runs/${runId}/objectives`, {
      method: 'POST',
      body: JSON.stringify(next)
    });
  };

  const approvePivot = (pivotId: string) => {
    fetch(`/api/pivots/${pivotId}/approve`, { method: 'POST' });
  };

  if (!data) return <div className="p-12 text-center text-gray-500 italic">Initializing mission data...</div>;

  const latestDebt = debt[0];
  const pendingPivots = pivots.filter(p => p.approval_status === 'pending');

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{data.run.mission_summary.slice(0, 80)}...</h1>
          <p className="text-gray-400 text-sm mt-1">Run ID: <span className="font-mono text-cyan-400">{runId}</span></p>
        </div>
        <div className="flex gap-4">
           {pendingPivots.length > 0 && (
             <div className="bg-red-500/20 border border-red-500/50 p-4 rounded-xl flex items-center gap-4 animate-pulse">
                <div>
                   <h3 className="text-xs font-bold text-red-400 uppercase tracking-widest">Major Pivot Proposed</h3>
                   <p className="text-sm text-white">Organization is hitting a plateau.</p>
                </div>
                <button 
                  onClick={() => approvePivot(pendingPivots[0].id)}
                  className="bg-red-500 hover:bg-red-400 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all"
                >
                  Approve Pivot
                </button>
             </div>
           )}
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="flex gap-1 border-b border-white/10">
        {[
          { id: 'overview', label: 'Mission Overview', icon: '🎯' },
          { id: 'security', label: 'Security & Signing', icon: '🛡️' },
          { id: 'logistics', label: 'Logistics & Ledger', icon: '📊' },
          { id: 'graph', label: 'Memory Graph', icon: '🕸️' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${
              activeTab === tab.id ? 'border-cyan-500 text-cyan-400 bg-white/5' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Sidebar: Controls & High-level Status */}
        <div className="lg:col-span-1 space-y-8">
          <section className="bg-white/5 p-6 rounded-2xl border border-white/10 space-y-6 shadow-xl">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Objective Optimization</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] text-gray-400 mb-1 uppercase"><span>Quality</span> <span>{objectives.quality.toFixed(1)}x</span></div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500" style={{ width: `${(objectives.quality / 2.0) * 100}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-gray-400 mb-1 uppercase"><span>Cost Range</span> <span>{objectives.cost.toFixed(1)}x</span></div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500" style={{ width: `${(objectives.cost / 2.0) * 100}%` }}></div>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-gray-500 italic leading-relaxed">System weighting adjusted for Cycle {data.run.total_cycles + 1}.</p>
          </section>

          <CostBreakdown data={costs} />

          {latestDebt && (
            <div className="bg-orange-500/5 p-6 rounded-2xl border border-orange-500/20">
               <h2 className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-4">Process Debt Audit</h2>
               <p className="text-sm text-gray-300 italic mb-4 leading-relaxed">"{latestDebt.critique_md}"</p>
               <div className="space-y-3">
                 {JSON.parse(latestDebt.bottlenecks_json).map((b: any, i: number) => (
                   <div key={i} className="text-xs bg-orange-500/10 p-2 rounded-lg">
                     <span className="text-orange-400 font-bold uppercase">{b.agent}:</span> <span className="text-gray-400">{b.issue}</span>
                   </div>
                 ))}
               </div>
            </div>
          )}
        </div>

        {/* Right Content Area: Switched by Tab */}
        <div className="lg:col-span-3 space-y-8">
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <div className="bg-black/40 p-10 rounded-3xl border border-white/10 min-h-[500px] shadow-2xl relative">
                <div className="absolute top-6 right-6 flex gap-2">
                   <span className="px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-bold border border-cyan-500/20">AGENTIC DRAFTS ACTIVE</span>
                </div>
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-8">Latest Organizational Output</h2>
                <div className="prose prose-invert prose-sm max-w-none">
                   <pre className="whitespace-pre-wrap font-sans text-gray-200 text-base leading-relaxed">
                     {data.run.latest_output_text || "Autonomous organization is formalizing mission parameters..."}
                   </pre>
                </div>
              </div>

              <section className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden shadow-lg">
                <div className="px-6 py-4 border-b border-white/10 bg-white/5">
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Autonomous Adaptation Log</h2>
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 text-gray-500 font-medium">
                    <tr>
                      <th className="px-6 py-3">Type</th>
                      <th className="px-6 py-3">Verdict</th>
                      <th className="px-6 py-3">Structural Rationale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {pivots.map((p) => (
                      <tr key={p.id} className="hover:bg-white/5 transition-all">
                        <td className="px-6 py-4">
                           <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${p.pivot_type === 'major' ? 'bg-red-500/20 text-red-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                             {p.pivot_type} PIVOT
                           </span>
                        </td>
                        <td className="px-6 py-4">
                           <span className="text-gray-300 font-bold uppercase tracking-tighter">{p.approval_status}</span>
                        </td>
                        <td className="px-6 py-4 text-gray-400 leading-relaxed max-w-md">
                           {JSON.parse(p.reasoning_json).reasoning}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <SecurityFindings runId={runId} />
               <div className="grid grid-cols-2 gap-8">
                  <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                     <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Provenance Verification</h3>
                     <p className="text-xs text-gray-400 mb-4">All artifacts in this run are SHA-256 hashed and linked back to the originating agent session.</p>
                     <div className="p-4 bg-black/40 rounded-xl border border-white/5 font-mono text-[10px] text-cyan-400/70">
                        GENESIS_ORG_MD: {data.run.org_md_hash.slice(0, 32)}...
                     </div>
                  </div>
                  <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                     <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Immutable Snapshots</h3>
                     <p className="text-xs text-gray-400 mb-4">Run state is snapshotted every 300 seconds and stored in the hardened recovery ledger.</p>
                     <button className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors uppercase tracking-widest">
                        Download State Pack (.zip)
                     </button>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'logistics' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <ToolTraces runId={runId} />
               <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Audit Ledger (Consolidated)</h3>
                  <div className="text-xs text-gray-400 italic">Centralized ledger of all agent-to-environment interactions.</div>
               </div>
            </div>
          )}

          {activeTab === 'graph' && (
            <div className="animate-in fade-in zoom-in-95 duration-500">
               <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">Semantic Knowledge Graph</h3>
                  <span className="text-[10px] text-gray-500 uppercase">Fact Density: {graphData.nodes.length} entities / {graphData.links.length} relations</span>
               </div>
               <GraphVisualization data={graphData} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
