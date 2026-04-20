React

'use client';

import { useState } from 'react';

interface Result {
  node_id: string;
  label: string;
  type: string;
  score: number;
}

export function GraphSearch({
  runId,
  onSelect,
}: {
  runId: string | null;
  onSelect?: (nodeId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!runId || !query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}/graph/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json() as { results: Result[] };
      setResults(data.results ?? []);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <h3 className="text-sm font-bold text-gray-400 mb-3">Graph Search</h3>

      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          placeholder="Search nodes semantically..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
        />
        <button
          onClick={search}
          disabled={loading || !query.trim()}
          className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 text-white px-4 py-2 rounded text-sm"
        >
          {loading ? '...' : 'Search'}
        </button>
      </div>

      <div className="mt-3 space-y-2 max-h-56 overflow-y-auto">
        {results.map((r) => (
          <button
            key={r.node_id}
            onClick={() => onSelect?.(r.node_id)}
            className="w-full text-left border border-gray-800 hover:border-cyan-700 rounded p-3 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="text-gray-200 font-medium">{r.label}</div>
              <div className="text-xs text-cyan-400">{(r.score * 100).toFixed(0)}%</div>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {r.type} · {r.node_id}
            </div>
          </button>
        ))}
        {!loading && query && results.length === 0 && (
          <div className="text-gray-600 text-sm">No results found.</div>
        )}
      </div>
    </div>
  );
}
10. Graph diff UI