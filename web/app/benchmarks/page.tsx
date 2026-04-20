'use client';

import { useEffect, useState } from 'react';

interface BenchmarkRun {
  id: string;
  suite_name: string;
  run_label: string;
  mode: string;
  status: string;
  started_at: string;
  finished_at: string;
  constitution_variant: string;
  template_variant: string;
}

export default function BenchmarksPage() {
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const fetchRuns = async () => {
    try {
      const res = await fetch('/api/benchmarks');
      const data = await res.json();
      setRuns(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const triggerRun = async () => {
    setStarting(true);
    try {
      await fetch('/api/benchmarks/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suiteName: 'core' }),
      });
      fetchRuns();
    } catch (err) {
      console.error(err);
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Benchmark Lab</h1>
          <p className="text-gray-400 text-sm mt-1">Measure and compare organizational performance across versions.</p>
        </div>
        <button
          onClick={triggerRun}
          disabled={starting}
          className="bg-cyan-500 hover:bg-cyan-400 disabled:bg-gray-700 text-black px-6 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2"
        >
          {starting ? 'Initializing...' : '🚀 Trigger Core Suite'}
        </button>
      </header>

      <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-gray-400 font-medium border-b border-white/10">
            <tr>
              <th className="px-6 py-4">Run Label</th>
              <th className="px-6 py-4">Suite</th>
              <th className="px-6 py-4">Variants</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {runs.map((run) => (
              <tr key={run.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-bold text-white uppercase tracking-tight">{run.run_label}</div>
                  <div className="text-[10px] text-gray-500 font-mono">{run.id}</div>
                </td>
                <td className="px-6 py-4">
                   <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 text-[11px] font-bold uppercase">{run.suite_name}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="text-[11px] text-gray-300">Const: <span className="text-white font-mono">{run.constitution_variant}</span></div>
                  <div className="text-[11px] text-gray-300">Temp: <span className="text-white font-mono">{run.template_variant}</span></div>
                </td>
                <td className="px-6 py-4">
                   <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                     run.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                     run.status === 'running' ? 'bg-blue-500/20 text-blue-400 animate-pulse' :
                     'bg-red-500/20 text-red-400'
                   }`}>
                     {run.status}
                   </span>
                </td>
                <td className="px-6 py-4 text-right text-gray-400 font-mono text-[11px]">
                  {new Date(run.started_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {loading && <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500 animate-pulse italic">Scanning benchmark history...</td></tr>}
            {!loading && runs.length === 0 && <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500 italic">No benchmark history found. Trigger the first run above.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
