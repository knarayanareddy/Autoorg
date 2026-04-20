/**
 * AutoOrg Results Logger
 * Writes results.tsv — the experiment log.
 * 
 * AutoResearch: "By morning, you have a git history of validated improvements
 * and a log of everything the agent tried."
 */

import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { RatchetScore } from '@/types/index.js';

const RESULTS_PATH = './results.tsv';
const HEADER = 'cycle\ttimestamp\tscore\tgroundedness\tnovelty\tconsistency\talignment\tdecision\tcost_usd\tsummary\n';

export async function ensureResultsFile(): Promise<void> {
  if (!existsSync(RESULTS_PATH)) {
    await writeFile(RESULTS_PATH, HEADER, 'utf-8');
  }
}

export async function logCycleResult(
  cycleNumber: number,
  score: RatchetScore,
  costUsd: number,
  summary: string
): Promise<void> {
  await ensureResultsFile();
  
  const row = [
    cycleNumber,
    new Date().toISOString(),
    score.composite.toFixed(4),
    score.groundedness.toFixed(4),
    score.novelty.toFixed(4),
    score.consistency.toFixed(4),
    score.alignment.toFixed(4),
    score.decision,
    costUsd.toFixed(6),
    // Sanitize summary: remove tabs and newlines
    summary.replace(/[\t\n\r]/g, ' ').slice(0, 200),
  ].join('\t');
  
  await appendFile(RESULTS_PATH, row + '\n', 'utf-8');
}

export async function readResults(): Promise<Array<{
  cycle: number;
  timestamp: string;
  score: number;
  decision: string;
  summary: string;
}>> {
  if (!existsSync(RESULTS_PATH)) return [];
  
  const content = await readFile(RESULTS_PATH, 'utf-8');
  const lines = content.trim().split('\n').slice(1); // skip header
  
  return lines
    .filter(l => l.trim())
    .map(line => {
      const parts = line.split('\t');
      return {
        cycle:     parseInt(parts[0] ?? '0'),
        timestamp: parts[1] ?? '',
        score:     parseFloat(parts[2] ?? '0'),
        decision:  parts[7] ?? 'UNKNOWN',
        summary:   parts[9] ?? '',
      };
    });
}

export async function getBestScore(): Promise<number> {
  const results = await readResults();
  const commits = results.filter(r => r.decision === 'COMMIT');
  if (commits.length === 0) return 0;
  return Math.max(...commits.map(r => r.score));
}
