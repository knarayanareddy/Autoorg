/**
 * AutoOrg — Memory Health Monitor
 *
 * Detects memory issues before they cause problems:
 * - MEMORY.md line count approaching the 150-line hard cap
 * - Low-confidence facts dragging down context quality
 * - Stale facts (not confirmed in many cycles)
 * - Open contradictions that need resolution
 * - Transcript archive size (prevent disk bloat)
 */

import { readFile }     from 'node:fs/promises';
import { existsSync }   from 'node:fs';
import { statSync }     from 'node:fs';
import { readdirSync }  from 'node:fs';
import chalk            from 'chalk';
import { getDb }        from '@/db/migrate.js';
import type { FactStore } from './fact-store.js';

export interface MemoryHealthReport {
  healthy:       boolean;
  warnings:      string[];
  critical:      string[];
  stats: {
    memoryIndexLines:    number;
    memoryIndexMaxLines: number;
    activeFactCount:     number;
    lowConfidenceFacts:  number;
    openContradictions:  number;
    transcriptFileCount: number;
    transcriptSizeMB:    number;
    lastDreamCycle:      number | null;
    cyclesSinceLastDream: number;
  };
  recommendations: string[];
}

const MAX_MEMORY_INDEX_LINES = 150;
const LOW_CONFIDENCE_THRESHOLD = 0.3;
const STALE_FACT_THRESHOLD_CYCLES = 20;
const MAX_TRANSCRIPT_SIZE_MB = 100;

export class MemoryHealthMonitor {
  private runId:      string;
  private factStore:  FactStore;

  constructor(runId: string, factStore: FactStore) {
    this.runId     = runId;
    this.factStore = factStore;
  }

  async checkHealth(currentCycle: number): Promise<MemoryHealthReport> {
    const warnings:        string[] = [];
    const critical:        string[] = [];
    const recommendations: string[] = [];

    // ── Check MEMORY.md line count ──────────────────────────────────
    let memoryIndexLines = 0;
    if (existsSync('./memory/MEMORY.md')) {
      const content = await readFile('./memory/MEMORY.md', 'utf-8');
      memoryIndexLines = content.split('\n').length;
    }

    if (memoryIndexLines > MAX_MEMORY_INDEX_LINES * 0.9) {
      critical.push(`MEMORY.md at ${memoryIndexLines}/${MAX_MEMORY_INDEX_LINES} lines (${(memoryIndexLines/MAX_MEMORY_INDEX_LINES*100).toFixed(0)}% of cap)`);
      recommendations.push('Run autoDream to consolidate and prune MEMORY.md');
    } else if (memoryIndexLines > MAX_MEMORY_INDEX_LINES * 0.7) {
      warnings.push(`MEMORY.md at ${memoryIndexLines}/${MAX_MEMORY_INDEX_LINES} lines — approaching cap`);
    }

    // ── Check fact store health ─────────────────────────────────────
    const factStats = this.factStore.getStats();

    const lowConfFacts = factStats.active - Math.round(
      factStats.avgConfidence * factStats.active
    );

    if (factStats.contradictions > 0) {
      warnings.push(`${factStats.contradictions} unresolved contradiction(s) in fact store`);
      recommendations.push('Run autoDream to resolve contradictions');
    }

    if (lowConfFacts > 5) {
      warnings.push(`${lowConfFacts} facts have low confidence (<${LOW_CONFIDENCE_THRESHOLD * 100}%)`);
      recommendations.push('DreamAgent should prune low-confidence facts');
    }

    // ── Check transcript archive size ────────────────────────────────
    const transcriptDir = './memory/transcripts';
    let   transcriptFileCount = 0;
    let   transcriptSizeMB    = 0;

    if (existsSync(transcriptDir)) {
      const files = readdirSync(transcriptDir).filter(f => f.endsWith('.jsonl'));
      transcriptFileCount = files.length;
      for (const file of files) {
        const stat = statSync(`${transcriptDir}/${file}`);
        transcriptSizeMB += stat.size / (1024 * 1024);
      }
    }

    if (transcriptSizeMB > MAX_TRANSCRIPT_SIZE_MB * 0.8) {
      warnings.push(`Transcript archive at ${transcriptSizeMB.toFixed(1)}MB (${(transcriptSizeMB/MAX_TRANSCRIPT_SIZE_MB*100).toFixed(0)}% of ${MAX_TRANSCRIPT_SIZE_MB}MB limit)`);
      recommendations.push('Consider archiving old transcripts to cold storage');
    }

    // ── Check last dream cycle ───────────────────────────────────────
    const db = getDb();
    const dreamRow = db.prepare(`
      SELECT MAX(cycle_number) AS last_dream FROM dream_runs WHERE run_id = ?
    `).get(this.runId) as { last_dream: number | null };
    db.close();

    const lastDreamCycle     = dreamRow.last_dream;
    const cyclesSinceLastDream = lastDreamCycle != null
      ? currentCycle - lastDreamCycle
      : currentCycle;

    if (cyclesSinceLastDream > 15) {
      warnings.push(`${cyclesSinceLastDream} cycles since last autoDream — memory may be stale`);
      recommendations.push('Run autoDream to refresh memory index');
    }

    const healthy = critical.length === 0;

    // Print health report
    if (!healthy) {
      console.log(chalk.bold.red('\n  ⚠️  MEMORY HEALTH: CRITICAL'));
      for (const c of critical) console.log(chalk.red(`     ✗ ${c}`));
    } else if (warnings.length > 0) {
      console.log(chalk.yellow(`\n  ⚠️  Memory warnings: ${warnings.length}`));
    }

    return {
      healthy,
      warnings,
      critical,
      stats: {
        memoryIndexLines,
        memoryIndexMaxLines: MAX_MEMORY_INDEX_LINES,
        activeFactCount:     factStats.active,
        lowConfidenceFacts:  lowConfFacts,
        openContradictions:  factStats.contradictions,
        transcriptFileCount,
        transcriptSizeMB,
        lastDreamCycle,
        cyclesSinceLastDream,
      },
      recommendations,
    };
  }
}
