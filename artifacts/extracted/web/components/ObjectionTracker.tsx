React

'use client';

interface Objection {
  id:           string;
  severity:     string;
  description:  string;
  proposed_fix: string;
  cycle_raised: number;
  resolved:     number;
}

interface ObjectionTrackerProps {
  objections: Objection[];
}

const SEVERITY_STYLES: Record<string, string> = {
  BLOCKER: 'bg-red-950   border-red-700   text-red-300',
  MAJOR:   'bg-yellow-950 border-yellow-700 text-yellow-300',
  MINOR:   'bg-gray-900  border-gray-700   text-gray-400',
};

const SEVERITY_ICONS: Record<string, string> = {
  BLOCKER: '🚨',
  MAJOR:   '⚠️',
  MINOR:   '·',
};

export function ObjectionTracker({ objections }: ObjectionTrackerProps) {
  const open     = objections.filter(o => !o.resolved);
  const resolved = objections.filter(o => o.resolved);

  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <h3 className="text-sm font-bold text-gray-400 mb-3 flex items-center gap-2">
        Objections
        <span className="bg-red-900 text-red-300 text-xs px-2 py-0.5 rounded-full">{open.length} open</span>
        <span className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full">{resolved.length} resolved</span>
      </h3>

      {open.length === 0 && (
        <p className="text-green-400 text-sm">✓ No open objections</p>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {open.map(obj => (
          <div
            key={obj.id}
            className={`border rounded p-2 text-xs ${SEVERITY_STYLES[obj.severity] ?? SEVERITY_STYLES.MINOR}`}
          >
            <div className="flex items-start gap-2">
              <span>{SEVERITY_ICONS[obj.severity]}</span>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <span className="font-bold">[{obj.id}]</span>
                  <span className="text-gray-500">Cycle {obj.cycle_raised}</span>
                </div>
                <p className="mt-1 leading-relaxed">{obj.description}</p>
                <p className="mt-1 text-gray-500">Fix: {obj.proposed_fix}</p>
              </div>
            </div>
          </div>
        ))}

        {resolved.slice(0, 3).map(obj => (
          <div key={obj.id} className="border border-gray-800 rounded p-2 text-xs opacity-40">
            <span className="text-green-400">✓</span>{' '}
            <span className="line-through text-gray-500">{obj.description.slice(0, 60)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}