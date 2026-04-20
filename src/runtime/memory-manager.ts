/**
 * AutoOrg Memory Manager — Phase 3 Full Upgrade
 *
 * The memory manager is now the central coordinator of the
 * three-tier memory system. It knows about all tiers and
 * orchestrates between them.
 *
 * Phase 3 additions:
 * ✓ Autonomous MEMORY.md rewriting (Archivist + DreamAgent)
 * ✓ Fact store integration (tier 2 structured facts)
 * ✓ Transcript indexing after each cycle (tier 3 FTS5)
 * ✓ Semantic search across all tiers
 * ✓ Memory health monitoring
 * ✓ Full autoDream integration
 */

import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync }                              from 'node:fs';
import chalk                                       from 'chalk';
import { getDb }                                   from '@/db/migrate.js';
import { FactStore, type FactCategory }            from '@/memory/fact-store.js';
import { MemoryHealthMonitor }                     from '@/memory/memory-health.js';
import { hybridSearch, searchFacts }               from '@/memory/hybrid-search.js';
import { indexTranscriptFile }                     from '@/memory/bm25.js';
import { featureFlag }                             from '@/config/feature-flags.js';
import type { RatchetScore }                       from '@/types/index.js';
import type { ArchivistOutputData }                from '@/prompts/archivist.js';
import { createBestAvailableGraphDB, type GraphDatabase } from '@/graph/graph-db.js';
import { GraphGroundingValidator, type GroundingResult }  from '@/graph/graph-grounding.js';

const MEMORY_ROOT       = process.env.AUTOORG_MEMORY_DIR ?? './memory';
const MEMORY_INDEX_PATH = `${MEMORY_ROOT}/MEMORY.md`;
const FACTS_DIR         = `${MEMORY_ROOT}/facts`;
const TRANSCRIPTS_DIR   = `${MEMORY_ROOT}/transcripts`;
const MAX_MEMORY_LINES  = 150;

export class MemoryManager {
  private runId:         string = '';
  private factStore:     FactStore | null = null;
  private healthMonitor: MemoryHealthMonitor | null = null;
  private graphDb:       GraphDatabase | null = null;
  private groundingValidator: GraphGroundingValidator | null = null;

  // ── Initialize with run context (Phase 4) ─────────────────────────
  async initialize(runId: string): Promise<void> {
    this.runId         = runId;
    this.factStore     = new FactStore(runId);
    this.healthMonitor = new MemoryHealthMonitor(runId, this.factStore);
    
    // Phase 4: Init graph
    if (featureFlag('knowledgeGraph')) {
      this.graphDb = await createBestAvailableGraphDB(runId);
      this.groundingValidator = new GraphGroundingValidator(this.graphDb);
    }
  }

  getGraphDb(): GraphDatabase {
    if (!this.graphDb) throw new Error('MemoryManager: GraphDB not initialized');
    return this.graphDb;
  }

  getFactStore(): FactStore {
    if (!this.factStore) throw new Error('MemoryManager not initialized — call initialize(runId)');
    return this.factStore;
  }

  // ── Read tier-1 index ─────────────────────────────────────────────
  async readIndex(): Promise<string> {
    if (!existsSync(MEMORY_INDEX_PATH)) return '[Memory index empty]';
    return readFile(MEMORY_INDEX_PATH, 'utf-8');
  }

  // ── Enforce 150-line cap ──────────────────────────────────────────
  private async enforceMemoryIndexCap(): Promise<void> {
    if (!existsSync(MEMORY_INDEX_PATH)) return;

    const content = await readFile(MEMORY_INDEX_PATH, 'utf-8');
    const lines   = content.split('\n');

    if (lines.length > MAX_MEMORY_LINES) {
      console.warn(chalk.yellow(
        `  ⚠  MEMORY.md: ${lines.length} lines → enforcing ${MAX_MEMORY_LINES}-line cap`
      ));
      // Keep header (first 20) + most recent entries
      const header   = lines.slice(0, 20);
      const body     = lines.slice(20);
      const trimmed  = body.slice(-(MAX_MEMORY_LINES - 20));
      await writeFile(MEMORY_INDEX_PATH, [...header, ...trimmed].join('\n'), 'utf-8');
    }
  }

  // ── Update memory index after a cycle ─────────────────────────────
  async updateIndexAfterCycle(
    cycleNumber: number,
    bestScore:   number,
    decision:    string,
    summary:     string
  ): Promise<void> {
    let content = await this.readIndex();

    content = content
      .replace(/Cycles completed: \d+/, `Cycles completed: ${cycleNumber}`)
      .replace(/Best score: [\d.]+/,    `Best score: ${bestScore.toFixed(4)}`);

    await writeFile(MEMORY_INDEX_PATH, content, 'utf-8');
    await this.enforceMemoryIndexCap();

    // Phase 3: Index the cycle's transcript immediately after it's written
    if (featureFlag('transcriptIndex')) {
      const paddedCycle   = String(cycleNumber).padStart(4, '0');
      const transcriptPath = `${TRANSCRIPTS_DIR}/cycle_${paddedCycle}.jsonl`;
      if (existsSync(transcriptPath)) {
        const indexed = await indexTranscriptFile(transcriptPath, this.runId);
        if (indexed > 0) {
          // Silent — indexing is background work
        }
      }
    }
  }

  // ── Record a failed experiment in fact store ───────────────────────
  async recordFailedExperiment(
    cycleNumber: number,
    score:       RatchetScore,
    reason:      string,
    whatToAvoid: string
  ): Promise<void> {
    // Legacy markdown file (backward compat)
    const entry = [
      `\n## Cycle ${cycleNumber} — REVERTED (score: ${score.composite.toFixed(4)})`,
      `- **Reason:** ${reason}`,
      `- **Avoid:** ${whatToAvoid}`,
      `- **Scores:** G:${score.groundedness.toFixed(2)} N:${score.novelty.toFixed(2)} C:${score.consistency.toFixed(2)} A:${score.alignment.toFixed(2)}`,
      `- **Recorded:** ${new Date().toISOString()}`,
    ].join('\n');

    const failedPath = `${FACTS_DIR}/failed_experiments.md`;
    await appendFile(failedPath, entry, 'utf-8');

    // Phase 3: Also add to structured fact store
    if (featureFlag('factStore') && this.factStore) {
      await this.factStore.addFact({
        statement:   `Approach in cycle ${cycleNumber} failed: ${reason}. Avoid: ${whatToAvoid}`,
        category:    'failed_approach',
        sourceCycle: cycleNumber,
        sourceType:  'ratchet',
        evidence:    `Score: ${score.composite.toFixed(4)} | ${reason}`,
        confidence:  0.7, // Ratchet REVERT is strong evidence
      });
    }
  }

  // ── Record a validated decision ───────────────────────────────────
  async recordValidatedDecision(
    cycleNumber: number,
    score:       RatchetScore,
    decision:    string,
    commitHash:  string
  ): Promise<void> {
    // Legacy markdown file
    const entry = [
      `\n## Cycle ${cycleNumber} — COMMITTED (score: ${score.composite.toFixed(4)}) [${commitHash}]`,
      `- **Decision:** ${decision}`,
      `- **Score delta:** +${score.composite.toFixed(4)}`,
      `- **Justification:** ${score.justification}`,
      `- **Recorded:** ${new Date().toISOString()}`,
    ].join('\n');

    const validatedPath = `${FACTS_DIR}/validated_decisions.md`;
    await appendFile(validatedPath, entry, 'utf-8');

    // Phase 3: Also add to structured fact store
    if (featureFlag('factStore') && this.factStore) {
      await this.factStore.addFact({
        statement:   `Approach in cycle ${cycleNumber} succeeded: ${decision.slice(0, 200)}`,
        category:    'validated_decision',
        sourceCycle: cycleNumber,
        sourceType:  'ratchet',
        evidence:    `Score: ${score.composite.toFixed(4)} | Commit: ${commitHash}`,
        confidence:  Math.min(0.5 + score.composite * 0.4, 0.95),
      });
    }
  }

  // ── Apply Archivist's memory update recommendations ───────────────
  async applyArchivistRecommendations(
    archivistData: ArchivistOutputData,
    cycleNumber:   number,
    score:         RatchetScore,
    decision:      string
  ): Promise<void> {
    const recs = archivistData.memory_update_recommendation;

    if (recs.add_to_failed && decision === 'REVERT') {
      await this.recordFailedExperiment(
        cycleNumber, score,
        recs.add_to_failed,
        archivistData.memory_search_findings.slice(0, 200)
      );
    }

    if (recs.add_to_validated && decision === 'COMMIT') {
      const validatedPath = `${FACTS_DIR}/validated_decisions.md`;
      await appendFile(
        validatedPath,
        `\n\n## Cycle ${cycleNumber} Archivist Note\n${recs.add_to_validated}\n`,
        'utf-8'
      );

      // Add to fact store
      if (featureFlag('factStore') && this.factStore) {
        await this.factStore.addFact({
          statement:   recs.add_to_validated,
          category:    'validated_decision',
          sourceCycle: cycleNumber,
          sourceType:  'archivist',
          confidence:  0.65,
        });
      }
    }

    if (recs.update_memory_index && featureFlag('autonomousMemoryRewrite')) {
      const current = await this.readIndex();
      const updated = current + `\n\n## Archivist Update — Cycle ${cycleNumber}\n${recs.update_memory_index}`;
      await writeFile(MEMORY_INDEX_PATH, updated, 'utf-8');
      await this.enforceMemoryIndexCap();
    }

    // Surface Archivist warnings
    if (archivistData.archivist_warning) {
      console.warn(chalk.bold.red(
        `\n  🚨 ARCHIVIST WARNING: ${archivistData.archivist_warning}\n`
      ));
    }
  }

  // ── Get recent transcript summary for agent context ───────────────
  async getRecentTranscriptSummary(
    lastNCycles:  number,
    currentCycle: number,
    query?:       string
  ): Promise<string> {
    // Phase 3: Use hybrid search if query provided and features enabled
    if (
      query &&
      featureFlag('semanticSearch') &&
      featureFlag('hybridSearch') &&
      this.runId
    ) {
      const results = await hybridSearch(query, this.runId, {
        topK: 15, minScore: 0.05,
      });

      if (results.length > 0) {
        return results
          .map(r => `[Cycle ${r.cycle_number}][${r.role}/${r.action}] ${r.content.slice(0, 120)}`)
          .join('\n');
      }
    }

    // Fallback: linear scan of recent transcript files
    const lines: string[] = [];
    const startCycle = Math.max(1, currentCycle - lastNCycles);

    for (let c = startCycle; c < currentCycle; c++) {
      const paddedCycle = String(c).padStart(4, '0');
      const filePath    = `${TRANSCRIPTS_DIR}/cycle_${paddedCycle}.jsonl`;
      if (!existsSync(filePath)) continue;

      try {
        const content = await readFile(filePath, 'utf-8');
        const entries = content.trim().split('\n')
          .filter(Boolean)
          .map(line => {
            try { return JSON.parse(line) as { role: string; action: string; content: string }; }
            catch { return null; }
          })
          .filter(Boolean);

        const keyMoments = entries
          .filter(e => e && ['score', 'commit', 'revert', 'error', 'response'].includes(e.action ?? ''))
          .map(e => `Cycle ${c} [${e?.role}/${e?.action}]: ${(e?.content ?? '').slice(0, 100)}`);

        lines.push(...keyMoments);
      } catch {
        // Skip malformed files
      }
    }

    return lines.slice(-20).join('\n') || '[No recent transcripts]';
  }

  // ── Semantic search for agent context ─────────────────────────────
  async semanticSearch(
    query:         string,
    topK:          number = 10
  ): Promise<string> {
    if (!this.runId) return '[MemoryManager not initialized]';

    const [transcriptResults, factResults, graphContext] = await Promise.all([
      featureFlag('semanticSearch') ? hybridSearch(query, this.runId, { topK, minScore: 0.05 }) : Promise.resolve([]),
      featureFlag('factStore') ? searchFacts(query, this.runId, undefined, 5) : Promise.resolve([]),
      featureFlag('knowledgeGraph') ? this.searchGraph(query) : Promise.resolve(''),
    ]);

    const lines: string[] = [];

    if (graphContext && graphContext !== '[No specific entities found in knowledge graph]') {
      lines.push('### Knowledge Graph Context:');
      lines.push(graphContext);
      lines.push('');
    }

    if (factResults.length > 0) {
      lines.push('### Relevant Facts:');
      for (const f of factResults) {
        lines.push(`  [${(f.confidence * 100).toFixed(0)}%] ${f.statement.slice(0, 120)}`);
      }
    }

    if (transcriptResults.length > 0) {
      lines.push('\n### Relevant Transcript Entries:');
      for (const r of transcriptResults) {
        lines.push(`  [Cycle ${r.cycle_number}][${r.role}] ${r.content.slice(0, 120)}`);
      }
    }

    return lines.join('\n') || '[No relevant results found]';
  }

  // ── Search Graph for agent context (Phase 4) ───────────────────────
  async searchGraph(query: string): Promise<string> {
    if (!featureFlag('knowledgeGraph') || !this.graphDb) return '[Graph search disabled]';
    
    // Find relevant nodes
    const nodes = await this.graphDb.findNodes({ where: { label: query }, limit: 5 });
    if (nodes.length === 0) return '[No specific entities found in knowledge graph]';

    const results: string[] = [];
    for (const node of nodes) {
      results.push(`[Entity: ${node.label}] ${node.properties.description}`);
      const neighbors = await this.graphDb.findNeighbors(node.id, 1);
      if (neighbors.length > 0) {
        results.push(`  Relationships: ${neighbors.map(n => n.label).join(', ')}`);
      }
    }
    return results.join('\n');
  }

  // ── Validate Claim grounding (Phase 4) ─────────────────────────────
  async validateClaimGrounding(claim: string): Promise<GroundingResult> {
    if (!this.groundingValidator) return { score: 0, supportingNodes: [], supportingEdges: [], explanation: 'Grounding disabled' };
    return this.groundingValidator.validateClaim(claim);
  }

  // ── Check memory health ────────────────────────────────────────────
  async checkHealth(currentCycle: number) {
    if (!this.healthMonitor) return { critical: [], warnings: [] };
    return this.healthMonitor.checkHealth(currentCycle);
  }

  // ── Get last dream cycle ──────────────────────────────────────────
  getLastDreamCycle(): number | null {
    if (!this.runId) return null;
    const db  = getDb();
    const row = db.prepare(
      `SELECT MAX(cycle_number) AS n FROM dream_runs WHERE run_id=?`
    ).get(this.runId) as { n: number | null };
    db.close();
    return row.n;
  }
}

// Singleton — initialized once per run
export const memoryManager = new MemoryManager();
