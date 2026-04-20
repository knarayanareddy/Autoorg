'use client';

import { useState, useRef, useEffect } from 'react';

const AGENT_ROLES = ['CEO', 'Engineer', 'Critic', 'DevilsAdvocate', 'Archivist', 'RatchetJudge'];

interface Turn {
  role:    'user' | 'assistant';
  content: string;
}

export default function InterviewPage() {
  const [selectedRole,  setSelectedRole]  = useState('Critic');
  const [cycleId,       setCycleId]       = useState('');
  const [question,      setQuestion]      = useState('');
  const [sessionId,     setSessionId]     = useState<string | null>(null);
  const [turns,         setTurns]         = useState<Turn[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [message,       setMessage]       = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  const startInterview = async () => {
    if (!question.trim()) return;
    setLoading(true);

    try {
      const res = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentRole: selectedRole,
          cycleId:   cycleId || undefined,
          question:  question.trim(),
        }),
      });

      const data = await res.json() as { sessionId: string; turns: Turn[] };
      setSessionId(data.sessionId);
      setTurns(data.turns);
      setQuestion('');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const continueInterview = async () => {
    if (!message.trim() || !sessionId) return;
    setLoading(true);

    const userTurn: Turn = { role: 'user', content: message.trim() };
    setTurns(prev => [...prev, userTurn]);
    setMessage('');

    try {
      const res = await fetch(`/api/interview/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userTurn.content }),
      });

      const data = await res.json() as { turns: Turn[] };
      setTurns(data.turns);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const ROLE_COLORS: Record<string, string> = {
    CEO:            'text-blue-400',
    Engineer:       'text-green-400',
    Critic:         'text-red-400',
    DevilsAdvocate: 'text-purple-400',
    Archivist:      'text-yellow-400',
    RatchetJudge:   'text-orange-400',
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      <div>
        <h1 className="text-xl font-bold text-white">Agent Interview</h1>
        <p className="text-gray-500 text-sm mt-1">
          Interrogate any agent about their reasoning, decisions, and perspective.
        </p>
      </div>

      {/* ── Session Setup ── */}
      {!sessionId && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Agent Role</label>
              <select
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              >
                {AGENT_ROLES.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Cycle ID (optional)</label>
              <input
                type="text"
                value={cycleId}
                onChange={e => setCycleId(e.target.value)}
                placeholder="cycle_XXXXXXXX"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Opening Question</label>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              rows={3}
              placeholder={`Ask the ${selectedRole} agent anything about their work...`}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={startInterview}
              disabled={loading || !question.trim()}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
            >
              {loading ? 'Connecting...' : `Interview ${selectedRole}`}
            </button>

            <div className="text-xs text-gray-600 self-center">
              Example: "Why did you raise that BLOCKER in cycle 5?"
            </div>
          </div>
        </div>
      )}

      {/* ── Conversation ── */}
      {sessionId && (
        <>
          <div className="flex items-center gap-3">
            <span className={`font-bold ${ROLE_COLORS[selectedRole] ?? 'text-white'}`}>
              {selectedRole}
            </span>
            <span className="text-gray-600 text-xs">Interview Session: {sessionId}</span>
            <button
              onClick={() => { setSessionId(null); setTurns([]); }}
              className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              New Interview
            </button>
          </div>

          <div className="space-y-4 max-h-[50vh] overflow-y-auto">
            {turns.map((turn, i) => (
              <div
                key={i}
                className={`flex gap-3 ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {turn.role === 'assistant' && (
                  <div className={`w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center text-xs ${ROLE_COLORS[selectedRole] ?? 'text-white'} shrink-0 mt-1`}>
                    {selectedRole[0]}
                  </div>
                )}
                <div className={`max-w-[80%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  turn.role === 'user'
                    ? 'bg-cyan-900/40 border border-cyan-800 text-cyan-100'
                    : 'bg-gray-900 border border-gray-800 text-gray-200'
                }`}>
                  {turn.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3">
                <div className={`w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center text-xs ${ROLE_COLORS[selectedRole] ?? ''} shrink-0`}>
                  {selectedRole[0]}
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-sm text-gray-500 animate-pulse">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* ── Message input ── */}
          <div className="flex gap-3">
            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); continueInterview(); } }}
              placeholder="Ask a follow-up question..."
              disabled={loading}
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            />
            <button
              onClick={continueInterview}
              disabled={loading || !message.trim()}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}
