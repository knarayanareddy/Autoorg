'use client';

import { useEffect, useState } from 'react';

interface Finding {
  id: string;
  severity: string;
  category: string;
  summary: string;
  details_json: string;
  status: string;
  created_at: string;
}

export function SecurityFindings({ runId }: { runId?: string }) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFindings = async () => {
    if (!runId) return;
    try {
      const res = await fetch(`/api/security/findings?runId=${runId}`);
      const data = await res.json();
      setFindings(data);
    } catch (err) {
      console.error('Failed to fetch security findings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFindings();
    const interval = setInterval(fetchFindings, 10000);
    return () => clearInterval(interval);
  }, [runId]);

  if (loading) return <div className="text-gray-500 animate-pulse text-xs">Scanning for security anomalies...</div>;

  return (
    <div className="bg-red-900/10 rounded-xl border border-red-500/20 overflow-hidden">
      <div className="px-4 py-3 border-b border-red-500/20 bg-red-950/20 flex items-center justify-between">
        <h3 className="text-sm font-bold text-red-100 flex items-center gap-2">
          <span className="text-red-400">🛡️</span>
          Hardening Compliance
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-red-400 font-mono">
          {findings.filter(f => f.status === 'open').length} issues flagged
        </span>
      </div>

      <div className="max-h-[300px] overflow-y-auto divide-y divide-red-500/10">
        {findings.length === 0 ? (
          <div className="p-6 text-center text-green-400/60 text-sm italic">
            ✅ No critical policy violations detected.
          </div>
        ) : (
          findings.map((f) => (
            <div key={f.id} className="p-4 hover:bg-white/5 transition-colors">
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                    f.severity === 'critical' ? 'bg-red-500 text-white animate-pulse' :
                    f.severity === 'error' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {f.severity}
                  </span>
                  <span className="text-xs font-bold text-white uppercase tracking-tight">{f.category.replace('_', ' ')}</span>
                </div>
                <span className="text-[9px] text-gray-500 font-mono">
                  {new Date(f.created_at).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-[11px] text-gray-300 mb-2">{f.summary}</p>
              
              {f.details_json && (
                <div className="bg-black/40 rounded p-2 text-[10px] font-mono text-red-200/70 border border-red-500/10">
                   {JSON.parse(f.details_json).reason}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
