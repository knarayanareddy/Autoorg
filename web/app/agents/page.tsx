'use client';

import { useState, useEffect } from 'react';

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/platform/agents')
      .then(res => res.json())
      .then(setAgents);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <h1 className="text-3xl font-bold mb-8 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
        Remote Agent Fleet
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {agents.map(agent => (
          <div key={agent.id} className="bg-gray-900/50 border border-gray-800 p-6 rounded-xl backdrop-blur-sm">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-semibold">{agent.agent_name}</h2>
              <span className={`px-2 py-1 rounded text-xs ${
                agent.status === 'idle' ? 'bg-green-500/20 text-green-400' : 
                agent.status === 'busy' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'
              }`}>
                {agent.status}
              </span>
            </div>
            
            <div className="space-y-2 text-sm text-gray-400">
              <p>ID: <code className="text-blue-400">{agent.id}</code></p>
              <p>Location: <span className="text-gray-200">{agent.agent_location}</span></p>
              <p>Last Heartbeat: {new Date(agent.heartbeat_at).toLocaleTimeString()}</p>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-800">
              <h3 className="text-xs uppercase text-gray-500 font-bold mb-2">Capabilities</h3>
              <div className="flex flex-wrap gap-2">
                {Object.keys(JSON.parse(agent.capabilities_json || '{}')).map(cap => (
                  <span key={cap} className="px-2 py-1 bg-gray-800 rounded text-[10px] text-gray-300">
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
