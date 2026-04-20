'use client';

import { useState, useEffect } from 'react';

export default function LearningPage() {
  const [proposals, setProposals] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/learning/proposals')
      .then(res => res.json())
      .then(setProposals);
  }, []);

  const release = async (id: string) => {
    await fetch(`/api/learning/proposals/${id}/release`, { method: 'POST' });
    // Refresh
    const res = await fetch('/api/learning/proposals');
    setProposals(await res.json());
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
          Cognitive Evolution
        </h1>
        <button 
          onClick={() => fetch('/api/learning/cycle', { method: 'POST' })}
          className="bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded-xl text-sm font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]"
        >
          ⚡ Trigger Learning Cycle
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {proposals.map(prop => (
          <div key={prop.id} className="bg-gray-900/40 border border-gray-800 rounded-2xl p-6 backdrop-blur-md relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-white uppercase tracking-tight">
                    Optimize {prop.target_key}
                  </h2>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                    prop.status === 'released' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                    prop.status === 'pending_approval' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-gray-800 text-gray-400 border-gray-700'
                  }`}>
                    {prop.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 font-mono">{prop.id} • {new Date(prop.created_at).toLocaleString()}</p>
              </div>
              
              {prop.status === 'pending_approval' && (
                <button 
                  onClick={() => release(prop.id)}
                  className="bg-white text-black px-4 py-2 rounded-lg text-xs font-black uppercase hover:bg-emerald-400 transition-colors"
                >
                  Approve & Release
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-[10px] uppercase font-black text-emerald-500 mb-2">Rationale</h3>
                  <div className="bg-black/40 rounded-lg p-4 text-sm text-gray-300 border border-gray-800/50">
                    {JSON.parse(prop.rationale_json).reasoning}
                  </div>
                </div>
                <div>
                  <h3 className="text-[10px] uppercase font-black text-cyan-500 mb-2">Expected Metric Delta</h3>
                  <div className="text-2xl font-mono text-cyan-400">
                    +{(JSON.parse(prop.rationale_json).expected_delta * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-[10px] uppercase font-black text-purple-500 mb-2">Proposed Revision</h3>
                <div className="bg-gray-950 rounded-lg p-4 border border-gray-800 overflow-x-auto">
                  <pre className="text-xs text-blue-300 font-mono leading-relaxed whitespace-pre-wrap">
                    {prop.candidate_content}
                  </pre>
                </div>
              </div>
            </div>
            
            {/* Background decoration */}
            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-colors" />
          </div>
        ))}
      </div>
    </div>
  );
}
