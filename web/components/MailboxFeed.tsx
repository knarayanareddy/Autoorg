'use client';

interface MailboxMessage {
  id:           string;
  from_agent:   string;
  to_agent:     string;
  message_type: string;
  created_at:   string;
  objection_severity?: string | null;
}

interface MailboxFeedProps {
  messages: MailboxMessage[];
}

const AGENT_COLORS: Record<string, string> = {
  CEO:            'text-blue-400',
  Engineer:       'text-green-400',
  Critic:         'text-red-400',
  DevilsAdvocate: 'text-purple-400',
  Archivist:      'text-yellow-400',
  RatchetJudge:   'text-orange-400',
  ORCHESTRATOR:   'text-cyan-400',
};

const TYPE_ICONS: Record<string, string> = {
  task:          '→',
  reply:         '←',
  objection:     '⚠',
  directive:     '►',
  memory_update: '💾',
};

export function MailboxFeed({ messages }: MailboxFeedProps) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <h3 className="text-sm font-bold text-gray-400 mb-3">
        📬 Mailbox ({messages.length} messages)
      </h3>

      <div className="space-y-1 max-h-48 overflow-y-auto font-mono text-xs">
        {messages.length === 0
          ? <p className="text-gray-600">No messages yet</p>
          : messages.map(msg => (
            <div key={msg.id} className="flex items-start gap-2 py-0.5">
              <span className="text-gray-600 w-16 shrink-0">
                {new Date(msg.created_at).toLocaleTimeString('en', { hour12: false })}
              </span>
              <span className={AGENT_COLORS[msg.from_agent] ?? 'text-gray-400'}>
                {msg.from_agent}
              </span>
              <span className="text-gray-600">
                {TYPE_ICONS[msg.message_type] ?? '?'}
              </span>
              <span className={AGENT_COLORS[msg.to_agent] ?? 'text-gray-400'}>
                {msg.to_agent}
              </span>
              {msg.objection_severity && (
                <span className={
                  msg.objection_severity === 'BLOCKER' ? 'text-red-400' :
                  msg.objection_severity === 'MAJOR'   ? 'text-yellow-400' :
                  'text-gray-500'
                }>
                  [{msg.objection_severity}]
                </span>
              )}
            </div>
          ))
        }
      </div>
    </div>
  );
}
