'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.id as string;
  const [data, setData] = useState<any>(null);
  const [pivots, setPivots] = useState<any[]>([]);
  const [debt, setDebt] = useState<any[]>([]);
  const [objectives, setObjectives] = useState({ quality: 1.0, cost: 1.0, speed: 1.0 });

  useEffect(() => {
    // Polling for run data
    const interval = setInterval(() => {
      fetch(`/api/runs/${runId}`).then(res => res.json()).then(setData);
      fetch(`/api/runs/${runId}/pivots`).then(res => res.json()).then(setPivots);
      fetch(`/api/runs/${runId}/debt`).then(res => res.json()).then(setDebt);
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left: Metrics & Controls */}
        <div className="lg:col-span-1 space-y-8">
          <section className="bg-white/5 p-6 rounded-2xl border border-white/10 space-y-6">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Objective Optimization</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] text-gray-400 mb-1 uppercase"><span>Quality Priority</span> <span>{objectives.quality.toFixed(1)}x</span></div>
                <input type="range" min="0.5" max="2.0" step="0.1" value={objectives.quality} 
                       onChange={(e) => updateObjective('quality', parseFloat(e.target.value))}
                       className="w-full accent-cyan-500" />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-gray-400 mb-1 uppercase"><span>Cost Weight</span> <span>{objectives.cost.toFixed(1)}x</span></div>
                <input type="range" min="0.5" max="2.0" step="0.1" value={objectives.cost}
                       onChange={(e) => updateObjective('cost', parseFloat(e.target.value))}
                       className="w-full accent-green-500" />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-gray-400 mb-1 uppercase"><span>Iteration Speed</span> <span>{objectives.speed.toFixed(1)}x</span></div>
                <input type="range" min="0.5" max="2.0" step="0.1" value={objectives.speed} 
                       onChange={(e) => updateObjective('speed', parseFloat(e.target.value))}
                       className="w-full accent-yellow-500" />
              </div>
            </div>
            <p className="text-[10px] text-gray-500 italic">Adjusting these mid-run will re-calculate model assignments for the next cycle.</p>
          </section>

          {latestDebt && (
            <section className="bg-white/5 p-6 rounded-2xl border border-white/10">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Process Debt Report</h2>
              <div className="mb-4">
                 <div className="text-[10px] text-gray-400 uppercase mb-1">Debt Score</div>
                 <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500" style={{ width: `${latestDebt.debt_score * 100}%` }}></div>
                 </div>
              </div>
              <p className="text-sm text-gray-300 italic mb-4">"{latestDebt.critique_md}"</p>
              <div className="space-y-3">
                {JSON.parse(latestDebt.bottlenecks_json).map((b: any, i: number) => (
                  <div key={i} className="text-xs">
                    <span className="text-orange-400 font-bold uppercase">{b.agent}:</span> <span className="text-gray-400">{b.issue}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right: Main Content (simplified) */}
        <div className="lg:col-span-3 space-y-8">
           <div className="bg-black/40 p-8 rounded-3xl border border-white/10 min-h-[500px] shadow-2xl relative">
              <div className="absolute top-4 right-4 flex gap-2">
                 <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 text-[10px] font-bold">SNAPSHOT TAKEN</span>
              </div>
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6">Current Organizational Output</h2>
              <div className="prose prose-invert prose-sm max-w-none">
                 {/* This would be real markdown in a real app */}
                 <pre className="whitespace-pre-wrap font-sans text-gray-200">
                   {data.run.latest_output_text || "The organization is iterating..."}
                 </pre>
              </div>
           </div>

           <section className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
             <div className="px-6 py-4 border-b border-white/10">
               <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Adaptation Log</h2>
             </div>
             <table className="w-full text-left text-xs">
               <thead className="bg-white/5 text-gray-500 font-medium">
                 <tr>
                   <th className="px-6 py-3">Type</th>
                   <th className="px-6 py-3">Outcome</th>
                   <th className="px-6 py-3">Reason</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                 {pivots.map((p) => (
                   <tr key={p.id} className="hover:bg-white/5">
                     <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${p.pivot_type === 'major' ? 'bg-red-500/20 text-red-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                          {p.pivot_type} PIVOT
                        </span>
                     </td>
                     <td className="px-6 py-3">
                        <span className="text-gray-300 font-bold uppercase">{p.approval_status}</span>
                     </td>
                     <td className="px-6 py-3 text-gray-400">
                        {JSON.parse(p.reasoning_json).reasoning}
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </section>
        </div>
      </div>
    </div>
  );
}
