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

const TRANSCRIPTS_DIR = path.join(
  process.env.AUTOORG_MEMORY_DIR ?? './memory',
  'transcripts'
);

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
    return path.join(TRANSCRIPTS_DIR, `cycle_${paddedCycle}.jsonl`);
  }

  async log(entry: Omit<TranscriptEntry, 'ts' | 'run_id'>): Promise<void> {
    if (!existsSync(TRANSCRIPTS_DIR)) {
      await mkdir(TRANSCRIPTS_DIR, { recursive: true });
    }

    const fullEntry: TranscriptEntry = {
      ts:      new Date().toISOString(),
      run_id:  this.runId,
      ...entry,
      content: entry.content.slice(0, 2000), // Tier-3 truncation
    };

    const filePath = this.getFilePath(entry.cycle);
    await appendFile(filePath, JSON.stringify(fullEntry) + '\n', 'utf-8');
  }

  async logAgentPrompt(
    role: AgentRole,
    cycle: number,
    systemPrompt: string,
    userMessage: string
  ): Promise<void> {
    await this.log({
      role,
      cycle,
      action:  'prompt',
      content: `SYSTEM: ${systemPrompt.slice(0, 500)}...\n\nUSER: ${userMessage.slice(0, 500)}`,
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