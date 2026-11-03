/**
 * AutoOrg Transcript Logger — Tier 3 Memory
 *
 * Every agent interaction is logged as JSONL to memory/transcripts/.
 * These files are NEVER auto-loaded into agent context (prevents bloat).
 * They are SEARCHABLE by the Archivist and DreamAgent.
 *
 * Claude Code KAIROS three-tier memory:
 *   Tier 1: MEMORY.md (always loaded — index only)
 *   Tier 2: memory/facts/*.md (on-demand)
 *   Tier 3: memory/transcripts/ (search only, never fully loaded)
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { existsSync }        from 'node:fs';
import path                  from 'node:path';
import type { AgentRole }    from '@/types/index.js';
import { RedactionFilter }   from '@/runtime/redaction.js';
import { transcriptContentEnabled, OMITTED_TRANSCRIPT_CONTENT, safeTranscriptAction } from './transcript-privacy.js';

/**
 * Resolved per call so tests can redirect AUTOORG_MEMORY_DIR after import.
 * (A module-level constant froze the path at first import, which made the
 * sink untestable in-process.)
 */
function transcriptsDir(): string {
  return path.join(process.env.AUTOORG_MEMORY_DIR ?? './memory', 'transcripts');
}

export interface TranscriptEntry {
  ts:         string;        // ISO timestamp
  run_id:     string;
  cycle:      number;
  role:       AgentRole | 'ORCHESTRATOR' | 'RATCHET';
  action:     string;        // 'prompt' | 'response' | 'score' | 'commit' | 'revert' | 'error'
  content:    string;        // truncated to 2000 chars for tier-3 searchability
  tokens?:    number;
  cost_usd?:  number;
  metadata?:  Record<string, unknown>;
}

export class TranscriptLogger {
  private currentFile: string | null = null;
  private runId: string = '';

  init(runId: string): void {
    this.runId = runId;
  }

  private getFilePath(cycleNumber: number): string {
    const paddedCycle = String(cycleNumber).padStart(4, '0');
    return path.join(transcriptsDir(), `cycle_${paddedCycle}.jsonl`);
  }

  async log(entry: Omit<TranscriptEntry, 'ts' | 'run_id'>): Promise<void> {
    const dir = transcriptsDir();
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    if (!transcriptContentEnabled()) {
      const safeEntry: TranscriptEntry = {
        ts: new Date().toISOString(), run_id: this.runId, cycle: entry.cycle,
        role: entry.role, action: safeTranscriptAction(entry.action),
        content: OMITTED_TRANSCRIPT_CONTENT, tokens: entry.tokens, cost_usd: entry.cost_usd,
      };
      await appendFile(this.getFilePath(entry.cycle), JSON.stringify(safeEntry) + '\n', { encoding: 'utf8', mode: 0o600 });
      return;
    }

    // Redaction happens AT THE SINK, before anything touches disk. Prompts and
    // responses used to be written raw and only redacted afterwards (when the
    // redactor ran for the LLM call), so every credential in LLM traffic was
    // persisted in cleartext in a file the Archivist can search. Redact first,
    // truncate second — slicing first could cut a secret mid-pattern and
    // defeat the detectors.
    const { text: safeContent } = new RedactionFilter(this.runId || 'unknown').redact(
      entry.content,
      { channel: 'transcript', cycleNumber: entry.cycle }
    );

    // Metadata may contain nested strings from callers too.
    const redactValue = (value: unknown): unknown => {
      if (typeof value === 'string') return new RedactionFilter(this.runId || 'unknown').redact(value, { channel: 'transcript', cycleNumber: entry.cycle }).text;
      if (Array.isArray(value)) return value.map(redactValue);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [RedactionFilter.redactOnly(k).text, redactValue(v)]));
      return value;
    };

    const fullEntry: TranscriptEntry = {
      ts:      new Date().toISOString(),
      run_id:  this.runId,
      ...entry,
      action: RedactionFilter.redactOnly(entry.action).text,
      content: safeContent.slice(0, 2000), // Tier-3 truncation
      metadata: entry.metadata ? redactValue(entry.metadata) as Record<string, unknown> : undefined,
    };

    const filePath = this.getFilePath(entry.cycle);
    await appendFile(filePath, JSON.stringify(fullEntry) + '\n', { encoding: 'utf8', mode: 0o600 });
  }

  async logAgentPrompt(
    role: AgentRole,
    cycle: number,
    systemPrompt: string,
    userMessage: string
  ): Promise<void> {
    const filter = new RedactionFilter(this.runId || 'unknown');
    const options = { channel: 'transcript' as const, cycleNumber: cycle };
    const safeSystem = filter.redact(systemPrompt, options).text;
    const safeUser = filter.redact(userMessage, options).text;
    await this.log({
      role,
      cycle,
      action:  'prompt',
      content: `SYSTEM: ${safeSystem.slice(0, 500)}...\n\nUSER: ${safeUser.slice(0, 500)}`,
    });
  }

  async logAgentResponse(
    role:    AgentRole,
    cycle:   number,
    content: string,
    tokens:  number,
    costUsd: number
  ): Promise<void> {
    await this.log({
      role,
      cycle,
      action:   'response',
      content,
      tokens,
      cost_usd: costUsd,
    });
  }

  async logRatchetScore(
    cycle:     number,
    composite: number,
    decision:  string,
    breakdown: Record<string, number>
  ): Promise<void> {
    await this.log({
      role:     'RATCHET',
      cycle,
      action:   'score',
      content:  `${decision} score=${composite.toFixed(4)}`,
      metadata: breakdown,
    });
  }

  async logOrchestrator(cycle: number, action: string, detail: string): Promise<void> {
    await this.log({
      role:    'ORCHESTRATOR',
      cycle,
      action,
      content: detail,
    });
  }
}

// Singleton
export const transcriptLogger = new TranscriptLogger();