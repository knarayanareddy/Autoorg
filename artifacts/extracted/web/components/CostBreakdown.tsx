React

'use client';

interface CostEntry {
  agent_role:   string;
  total_cost:   number;
  total_tokens: number;
  exec_count:   number;
}

interface CostBreakdownProps {
  data: CostEntry[];
}

const ROLE_COLORS: Record<string, string> = {
  CEO:            'bg-blue-600',
  Engineer:       'bg-green-600',
  Critic:         'bg-red-600',
  DevilsAdvocate: 'bg-purple-600',
  Archivist:      'bg-yellow-600',
  RatchetJudge:   'bg-orange-600',
  DreamAgent:     'bg-pink-600',
};

export function CostBreakdown({ data }: CostBreakdownProps) {
  const totalCost = data.reduce((s, d) => s + d.total_cost, 0);

  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <h3 className="text-sm font-bold text-gray-400 mb-3">
        Cost Breakdown
        <span className="ml-2 text-cyan-400">${totalCost.toFixed(4)} total</span>
      </h3>

      {data.length === 0
        ? <p className="text-gray-600 text-sm">No cost data yet</p>
        : (
          <div className="space-y-2">
            {data.map(entry => {
              const pct = totalCost > 0 ? (entry.total_cost / totalCost) * 100 : 0;
              return (
                <div key={entry.agent_role}>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>{entry.agent_role}</span>
                    <span>${entry.total_cost.toFixed(5)} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${ROLE_COLORS[entry.agent_role] ?? 'bg-gray-600'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    {entry.total_tokens.toLocaleString()} tokens · {entry.exec_count} calls
                  </div>
                </div>
              );
            })}
          </div>
        )
      }
    </div>
  );
}