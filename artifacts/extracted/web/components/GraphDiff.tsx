React

'use client';

interface DiffPayload {
  addedNodes: Array<{ node_id: string; label: string; node_type: string }>;
  removedNodes: Array<{ node_id: string; label: string; node_type: string }>;
  addedEdges: Array<{ edge_id: string; from_node_id: string; to_node_id: string; rel_type: string }>;
  removedEdges: Array<{ edge_id: string; from_node_id: string; to_node_id: string; rel_type: string }>;
}

export function GraphDiff({ diff }: { diff: DiffPayload | null }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <h3 className="text-sm font-bold text-gray-400 mb-3">Graph Diff</h3>

      {!diff ? (
        <div className="text-gray-600 text-sm">No diff loaded.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <div className="text-green-400 font-bold mb-2">Added Nodes ({diff.addedNodes.length})</div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {diff.addedNodes.map(n => (
                <div key={n.node_id} className="border border-green-900 rounded p-2">
                  <div className="text-gray-200">{n.label}</div>
                  <div className="text-gray-500">{n.node_type} · {n.node_id}</div>
                </div>
              ))}
              {diff.addedNodes.length === 0 && <div className="text-gray-600">None</div>}
            </div>
          </div>

          <div>
            <div className="text-red-400 font-bold mb-2">Removed Nodes ({diff.removedNodes.length})</div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {diff.removedNodes.map(n => (
                <div key={n.node_id} className="border border-red-900 rounded p-2">
                  <div className="text-gray-200">{n.label}</div>
                  <div className="text-gray-500">{n.node_type} · {n.node_id}</div>
                </div>
              ))}
              {diff.removedNodes.length === 0 && <div className="text-gray-600">None</div>}
            </div>
          </div>

          <div>
            <div className="text-green-400 font-bold mb-2">Added Edges ({diff.addedEdges.length})</div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {diff.addedEdges.map(e => (
                <div key={e.edge_id} className="border border-green-900 rounded p-2 text-gray-300">
                  {e.from_node_id} —[{e.rel_type}]→ {e.to_node_id}
                </div>
              ))}
              {diff.addedEdges.length === 0 && <div className="text-gray-600">None</div>}
            </div>
          </div>

          <div>
            <div className="text-red-400 font-bold mb-2">Removed Edges ({diff.removedEdges.length})</div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {diff.removedEdges.map(e => (
                <div key={e.edge_id} className="border border-red-900 rounded p-2 text-gray-300">
                  {e.from_node_id} —[{e.rel_type}]→ {e.to_node_id}
                </div>
              ))}
              {diff.removedEdges.length === 0 && <div className="text-gray-600">None</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
11. Patch web/app/graph/page.tsx
Replace the file with this improved version.
