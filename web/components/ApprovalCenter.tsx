'use client';

import { useEffect, useState } from 'react';

interface Approval {
  id: string;
  run_id: string;
  approval_type: string;
  subject: string;
  requested_by: string;
  status: string;
  summary: string;
  requested_at: string;
}

export function ApprovalCenter() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchApprovals = async () => {
    try {
      const res = await fetch('/api/approvals');
      const data = await res.json();
      setApprovals(data);
    } catch (err) {
      console.error('Failed to fetch approvals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
    const interval = setInterval(fetchApprovals, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    try {
      await fetch(`/api/approvals/${id}/${action}`, { method: 'POST' });
      fetchApprovals();
    } catch (err) {
      console.error(`Failed to ${action} approval ${id}:`, err);
    }
  };

  if (loading) return <div className="text-gray-500 animate-pulse">Loading approval queue...</div>;

  return (
    <div className="bg-gray-900/50 backdrop-blur-md rounded-xl border border-gray-800 overflow-hidden shadow-2xl">
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-black/20">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-ping" />
          Human Approval Queue
        </h2>
        <span className="text-xs font-mono text-gray-500">{approvals.length} pending</span>
      </div>

      <div className="divide-y divide-gray-800">
        {approvals.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            <div className="text-3xl mb-2">🛡️</div>
            <p>All clear. No pending approvals required.</p>
          </div>
        ) : (
          approvals.map((ap) => (
            <div key={ap.id} className="p-6 hover:bg-white/5 transition-colors">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-800 text-gray-300">
                      {ap.approval_type}
                    </span>
                    <span className="text-xs text-gray-500">Requested by {ap.requested_by}</span>
                  </div>
                  <h3 className="text-md font-semibold text-white">{ap.summary}</h3>
                  <p className="text-sm text-gray-400 line-clamp-2">{ap.subject}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleAction(ap.id, 'reject')}
                    className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all font-medium text-sm"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleAction(ap.id, 'approve')}
                    className="px-4 py-2 rounded-lg bg-cyan-500 text-white shadow-lg shadow-cyan-500/20 hover:bg-cyan-400 hover:-translate-y-0.5 active:translate-y-0 transition-all font-bold text-sm"
                  >
                    Approve
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
