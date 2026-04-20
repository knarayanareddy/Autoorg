'use client';

import { useState, useEffect } from 'react';

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/platform/workspaces')
      .then(res => res.json())
      .then(setWorkspaces);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-400">
          Managed Workspaces
        </h1>
        <button className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
          + New Workspace
        </button>
      </div>

      <div className="bg-gray-900/40 border border-gray-800 rounded-2xl overflow-hidden backdrop-blur-md">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-800/50 text-gray-400 text-xs uppercase tracking-wider">
              <th className="px-6 py-4 font-bold">Workspace</th>
              <th className="px-6 py-4 font-bold">Isolation</th>
              <th className="px-6 py-4 font-bold">Root Path</th>
              <th className="px-6 py-4 font-bold">Status</th>
              <th className="px-6 py-4 font-bold">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {workspaces.map(ws => (
              <tr key={ws.id} className="hover:bg-white/5 transition-colors group">
                <td className="px-6 py-4">
                  <div className="font-medium text-white">{ws.display_name}</div>
                  <div className="text-xs text-gray-500 font-mono">{ws.id}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    ws.isolation_mode === 'docker' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-gray-700 text-gray-300'
                  }`}>
                    {ws.isolation_mode}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs font-mono text-gray-400">
                  {ws.root_path}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${ws.status === 'active' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-gray-600'}`} />
                    <span className="text-sm capitalize">{ws.status}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(ws.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
