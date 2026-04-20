'use client';

import { useEffect, useState } from 'react';

interface LeaderboardEntry {
  id: string;
  suite_name: string;
  leaderboard_type: string;
  subject_key: string;
  average_score: number;
  average_gold_match: number;
  pass_rate: number;
  samples: number;
  updated_at: string;
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/leaderboards')
      .then(res => res.json())
      .then(data => {
        setEntries(data);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white tracking-tight">Organization Leaderboard</h1>
        <p className="text-gray-400 text-sm mt-1">Global performance rankings across model assignments and org templates.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {['model', 'template', 'overall'].map((type) => (
          <div key={type} className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">{type} Rankings</h2>
              <span className="text-[10px] text-gray-500 font-mono italic">Sorted by Pass Rate</span>
            </div>
            <div className="divide-y divide-white/5">
              {entries.filter(e => e.leaderboard_type === type).length === 0 ? (
                <div className="p-12 text-center text-gray-500 italic text-sm">No {type} data yet.</div>
              ) : (
                entries.filter(e => e.leaderboard_type === type).map((entry, idx) => (
                  <div key={entry.id} className="p-6 flex items-center justify-between hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-bold text-gray-600 font-mono w-6">{idx + 1}</span>
                      <div>
                        <div className="text-sm font-bold text-white uppercase tracking-tight">{entry.subject_key}</div>
                        <div className="text-[10px] text-purple-400 font-mono">{entry.samples} samples</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-8 text-right">
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Score</div>
                        <div className="text-lg font-bold text-white font-mono">{entry.average_score.toFixed(3)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Gold Match</div>
                        <div className="text-lg font-bold text-cyan-400 font-mono">{(entry.average_gold_match * 100).toFixed(0)}%</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Pass Rate</div>
                        <div className="text-lg font-bold text-green-400 font-mono">{(entry.pass_rate * 100).toFixed(0)}%</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
