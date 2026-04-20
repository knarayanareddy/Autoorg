'use client';

import { useEffect, useState } from 'react';

interface ToolExecution {
  id: string;
  role: string;
  tool_name: string;
  capability_class: string;
  status: string;
  input_json: string;
  output_summary: string;
  duration_ms: number;
  cost_usd: number;
  created_at: string;
}

export function ToolTraces({ runId }: { runId?: string }) {
  const [traces, setTraces] = useState<ToolExecution[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTraces = async () => {
    if (!runId) return;
    try {
      const res = await fetch(`/api/tools/executions?runId=${runId}`);
      const data = await res.json();
      setTraces(data);
    } catch (err) {
      console.error('Failed to fetch tool traces:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTraces();
    const interval = setInterval(fetchTraces, 10000);
    return () => clearInterval(interval);
  }, [runId]);

  if (loading) return <div className="text-gray-500 animate-pulse text-xs">Loading execution traces...</div>;

  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 bg-black/20 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span className="text-cyan-400">⚙️</span>
          Tool Execution Traces
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">
          Last {traces.length} calls
        </span>
      </div>

      <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-800/50">
        {traces.length === 0 ? (
          <div className="p-8 text-center text-gray-600 text-sm italic">
            No tool executions recorded for this run.
          </div>
        ) : (
          traces.map((tx) => (
            <div key={tx.id} className="p-4 hover:bg-white/5 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${
                    tx.status === 'completed' ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 
                    tx.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'
                  }`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{tx.tool_name}</span>
                      <span className="text-[10px] text-gray-500 font-mono">by {tx.role}</span>
                    </div>
                  </div>
                </div>
                <div className="text-[10px] font-mono text-gray-500">
                  {tx.duration_ms}ms | ${tx.cost_usd.toFixed(4)}
                </div>
              </div>
              
              <div className="space-y-1.5">
                <div className="bg-black/40 rounded p-2 text-[10px] font-mono text-gray-300 border border-white/5 overflow-x-auto">
                    <span className="text-gray-600 uppercase mr-2">Input:</span>
                    {tx.input_json.length > 100 ? tx.input_json.slice(0, 100) + '...' : tx.input_json}
                </div>
                {tx.output_summary && (
                  <p className="text-[11px] text-gray-400 leading-relaxed italic">
                    {tx.output_summary}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
