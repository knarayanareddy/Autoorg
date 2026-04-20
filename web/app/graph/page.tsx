'use client';

import { useState, useEffect, useCallback } from 'react';
import GraphVisualization from '@/components/GraphVisualization';

export default function GraphPage() {
  const [runId, setRunId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLatestRun = useCallback(async () => {
    try {
      const runs = await fetch('/api/runs').then(r => r.json()) as Array<{ id: string }>;
      if (runs.length > 0 && runs[0]) {
        const id = runs[0].id;
        setRunId(id);
        const data = await fetch(`/api/graph?runId=${id}`).then(r => r.json());
        setGraphData(data);
      }
    } catch (err) {
      console.error('Failed to fetch graph:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLatestRun();
  }, [fetchLatestRun]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Knowledge Graph</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {runId ? `Relational context for run: ${runId}` : 'No active run found'}
          </p>
        </div>
        <button 
          onClick={fetchLatestRun}
          className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded transition-colors"
        >
          Refresh Graph
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-gray-500 animate-pulse">
          Loading knowledge graph...
        </div>
      ) : graphData && graphData.nodes.length > 0 ? (
        <div className="space-y-4">
          <GraphVisualization data={graphData} />
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 py-4">
            <div className="bg-gray-900 border border-gray-800 p-3 rounded-lg text-center">
              <div className="text-xs text-gray-500">Nodes</div>
              <div className="text-xl font-bold text-cyan-400">{graphData.nodes.length}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 p-3 rounded-lg text-center">
              <div className="text-xs text-gray-500">Edges</div>
              <div className="text-xl font-bold text-green-400">{graphData.links.length}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-20 bg-gray-900 rounded-lg border border-gray-800 border-dashed">
          <div className="text-4xl mb-4">🕸️</div>
          <p className="text-gray-400">Knowledge Graph is empty for this run.</p>
          <p className="text-xs text-gray-600 mt-2">
            The graph is built from seed material during the first cycle.
          </p>
        </div>
      )}
    </div>
  );
}
