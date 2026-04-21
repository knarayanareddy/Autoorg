#!/usr/bin/env bun
/**
 * AutoOrg — Ink Terminal Dashboard
 *
 * Full real-time TUI for observing AutoOrg runs.
 * Source: Claude Code's Ink-based terminal UI (confirmed from leaked stack).
 *
 * Usage:
 *   bun run src/ui/terminal/Dashboard.tsx
 *   Or attach via: import { Dashboard } from './Dashboard'
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, render, useInput, useApp } from 'ink';
import Spinner from 'ink-spinner';

// ── Types ─────────────────────────────────────────────────────────────────
export interface AgentStatus {
  name:    string;
  state:   'idle' | 'running' | 'done' | 'error';
  lastMsg?: string;
}

export interface RatchetScore {
  composite:    number;
  groundedness: number;
  novelty:      number;
  consistency:  number;
  alignment:    number;
  decision:     'COMMIT' | 'REVERT' | 'DISQUALIFIED' | null;
}

export interface MailboxEntry {
  from:    string;
  to:      string;
  preview: string;
}

export interface DashboardProps {
  runId:        string;
  cycle:        number;
  maxCycles:    number;
  bestScore:    number;
  currentScore: RatchetScore | null;
  agents:       AgentStatus[];
  mailbox:      MailboxEntry[];
  memoryLines:  number;
  lastDream:    number;
  budgetUsed:   number;
  budgetMax:    number;
  phase:        string;
  isRunning:    boolean;
}

// ── Colour helpers ─────────────────────────────────────────────────────────
function scoreColour(s: number): string {
  if (s >= 0.85) return 'green';
  if (s >= 0.65) return 'yellow';
  return 'red';
}

function decisionColour(d: string | null): string {
  if (d === 'COMMIT') return 'green';
  if (d === 'REVERT') return 'red';
  return 'gray';
}

// ── AgentPanel ─────────────────────────────────────────────────────────────
export function AgentPanel({ name, state, lastMsg }: AgentStatus) {
  const stateColour: Record<string, string> = {
    idle:    'gray',
    running: 'cyan',
    done:    'green',
    error:   'red',
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={stateColour[state] ?? 'gray'}
      paddingX={1}
      width={16}
    >
      <Box>
        {state === 'running' && (
          <Text color="cyan"><Spinner type="dots" /></Text>
        )}
        {state !== 'running' && (
          <Text color={stateColour[state] ?? 'gray'}>
            {state === 'done' ? '✓' : state === 'error' ? '✗' : '·'}
          </Text>
        )}
        <Text bold color={stateColour[state] ?? 'gray'}> {name}</Text>
      </Box>
      {lastMsg && (
        <Text color="gray" dimColor>{lastMsg.slice(0, 13)}</Text>
      )}
    </Box>
  );
}

// ── RatchetDisplay ─────────────────────────────────────────────────────────
export function RatchetDisplay({
  currentScore,
  bestScore,
  history,
}: {
  currentScore: RatchetScore | null;
  bestScore:    number;
  history:      Array<{ composite: number; decision: string }>;
}) {
  const sparkline = history.slice(-20).map(h => {
    const pct = Math.round(h.composite * 8);
    const bars = '▁▂▃▄▅▆▇█';
    return h.decision === 'COMMIT'
      ? <Text key={Math.random()} color="green">{bars[pct] ?? '▁'}</Text>
      : <Text key={Math.random()} color="red">{bars[pct] ?? '▁'}</Text>;
  });

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} marginTop={1}>
      <Text bold color="cyan">⚖️  Ratchet</Text>
      <Box gap={2} marginTop={1}>
        <Box flexDirection="column">
          <Text color="gray" dimColor>best</Text>
          <Text bold color="green">{(bestScore * 100).toFixed(1)}%</Text>
        </Box>
        {currentScore && (
          <>
            <Box flexDirection="column">
              <Text color="gray" dimColor>current</Text>
              <Text bold color={scoreColour(currentScore.composite)}>
                {(currentScore.composite * 100).toFixed(1)}%
              </Text>
            </Box>
            <Box flexDirection="column">
              <Text color="gray" dimColor>G    N    C    M</Text>
              <Text>
                <Text color="cyan">{(currentScore.groundedness * 100).toFixed(0)}</Text>
                <Text color="gray">  </Text>
                <Text color="yellow">{(currentScore.novelty * 100).toFixed(0)}</Text>
                <Text color="gray">  </Text>
                <Text color="magenta">{(currentScore.consistency * 100).toFixed(0)}</Text>
                <Text color="gray">  </Text>
                <Text color="blue">{(currentScore.alignment * 100).toFixed(0)}</Text>
              </Text>
            </Box>
            <Box flexDirection="column">
              <Text color="gray" dimColor>decision</Text>
              <Text bold color={decisionColour(currentScore.decision)}>
                {currentScore.decision ?? '—'}
              </Text>
            </Box>
          </>
        )}
      </Box>
      {history.length > 0 && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>history: </Text>
          {sparkline}
        </Box>
      )}
    </Box>
  );
}

// ── MemoryViewer ───────────────────────────────────────────────────────────
export function MemoryViewer({
  tier1Lines,
  lastDream,
}: {
  tier1Lines: number;
  lastDream:  number;
}) {
  const capPct = Math.round((tier1Lines / 150) * 100);
  const barLen = Math.round(capPct / 5);
  const bar = '█'.repeat(barLen) + '░'.repeat(20 - barLen);
  const capColour = capPct > 80 ? 'red' : capPct > 60 ? 'yellow' : 'green';

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
      <Text bold color="gray">💾 Memory</Text>
      <Box gap={2}>
        <Box flexDirection="column">
          <Text color="gray" dimColor>MEMORY.md</Text>
          <Text color={capColour}>{bar} {tier1Lines}/150</Text>
        </Box>
        <Box flexDirection="column">
          <Text color="gray" dimColor>last dream</Text>
          <Text color="magenta">{lastDream > 0 ? `cycle ${lastDream}` : 'never'}</Text>
        </Box>
      </Box>
    </Box>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────
export function Dashboard({
  runId, cycle, maxCycles, bestScore, currentScore,
  agents, mailbox, memoryLines, lastDream,
  budgetUsed, budgetMax, phase, isRunning,
}: DashboardProps) {
  const { exit } = useApp();

  useInput((input) => {
    if (input === 'q' || input === 'Q') exit();
  });

  const budgetPct = budgetMax > 0 ? (budgetUsed / budgetMax) * 100 : 0;
  const budgetColour = budgetPct > 80 ? 'red' : budgetPct > 50 ? 'yellow' : 'green';

  return (
    <Box flexDirection="column" padding={1}>

      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={2} marginBottom={1}>
        <Text bold color="cyan">🔬 AutoOrg</Text>
        <Text color="gray">  run: </Text>
        <Text color="white">{runId}</Text>
        <Text color="gray">  cycle: </Text>
        <Text bold color="white">{cycle}/{maxCycles}</Text>
        <Text color="gray">  phase: </Text>
        <Text color="cyan">{phase}</Text>
        <Text color="gray">  budget: </Text>
        <Text bold color={budgetColour}>${budgetUsed.toFixed(3)}</Text>
        <Text color="gray">/${budgetMax.toFixed(2)}</Text>
        <Text color="gray">  </Text>
        {isRunning
          ? <Text color="green"><Spinner type="dots" /><Text bold> LIVE</Text></Text>
          : <Text color="gray">● IDLE</Text>}
      </Box>

      {/* Agent Status Grid */}
      <Box gap={1} flexWrap="wrap">
        {agents.map(a => <AgentPanel key={a.name} {...a} />)}
      </Box>

      {/* Ratchet Display */}
      <RatchetDisplay
        currentScore={currentScore}
        bestScore={bestScore}
        history={[]}
      />

      {/* Mailbox Feed */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginTop={1}
      >
        <Text bold color="gray">📬 Mailbox</Text>
        {mailbox.length === 0 && (
          <Text color="gray" dimColor>No messages this cycle</Text>
        )}
        {mailbox.slice(0, 5).map((m, i) => (
          <Text key={i} color="gray">
            <Text color="cyan">{m.from}</Text>
            <Text> → </Text>
            <Text color="yellow">{m.to}</Text>
            <Text dimColor>: {m.preview.slice(0, 50)}</Text>
          </Text>
        ))}
      </Box>

      {/* Memory Viewer */}
      <MemoryViewer tier1Lines={memoryLines} lastDream={lastDream} />

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>Press </Text>
        <Text color="white">q</Text>
        <Text color="gray" dimColor> to quit</Text>
      </Box>

    </Box>
  );
}

// ── Demo Mode ──────────────────────────────────────────────────────────────
// Run `bun run src/ui/terminal/Dashboard.tsx` to see a live demo
if (import.meta.main) {
  const DEMO_AGENTS: AgentStatus[] = [
    { name: 'CEO',           state: 'done',    lastMsg: 'Assigned' },
    { name: 'Engineer',      state: 'running', lastMsg: 'Drafting...' },
    { name: 'Critic',        state: 'running', lastMsg: 'Reviewing' },
    { name: 'DevilsAdv',     state: 'idle',    lastMsg: undefined },
    { name: 'Archivist',     state: 'done',    lastMsg: 'Memory OK' },
    { name: 'RatchetJudge',  state: 'idle',    lastMsg: undefined },
  ];

  render(
    <Dashboard
      runId="run_demo"
      cycle={7}
      maxCycles={50}
      bestScore={0.712}
      currentScore={{
        composite:    0.734,
        groundedness: 0.81,
        novelty:      0.70,
        consistency:  0.72,
        alignment:    0.68,
        decision:     'COMMIT',
      }}
      agents={DEMO_AGENTS}
      mailbox={[
        { from: 'CEO',      to: 'Engineer',     preview: 'Draft section 2 focusing on entity X' },
        { from: 'Engineer', to: 'CEO',          preview: 'Section 2 revised, 450 words' },
        { from: 'Critic',   to: 'CEO',          preview: 'MAJOR: claim on Y lacks graph support' },
      ]}
      memoryLines={87}
      lastDream={5}
      budgetUsed={0.234}
      budgetMax={10.00}
      phase="Phase 2 — Workers"
      isRunning={true}
    />
  );
}
