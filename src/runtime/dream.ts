/**
 * AutoOrg — Full autoDream Engine
 *
 * The complete KAIROS autoDream implementation.
 * This is the "background daemon" that consolidates memory between cycles.
 *
 * From Claude Code KAIROS leak:
 * "The scaffolding includes a /dream skill for nightly memory distillation,
 *  GitHub webhook subscriptions, and background daemon workers on a
 *  five-minute cron refresh."
 *
 * AutoOrg's version:
 * - Runs every N cycles (configurable in org.md)
 * - OR triggered by plateau detection (score stuck)
 * - OR triggered by memory health monitor (MEMORY.md approaching cap)
 *
 * Full pipeline:
 *   1. Index recent transcripts (FTS5 + embeddings)
 *   2. Hybrid search for patterns/failures
 *   3. Load current fact store + memory files
 *   4. Call DreamAgent LLM
 *   5. Parse structured output
 *   6. Apply facts to fact store
 *   7. Resolve contradictions
 *   8. Rewrite MEMORY.md (with 150-line cap enforcement)
 *   9. Snapshot memory state to DB
 *   10. Write dream report to workspace/
 *   11. Git commit dream changes
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync }    from 'node:fs';
import { createHash }                 from 'node:crypto';
import chalk                          from 'chalk';
import { nanoid }                     from 'nanoid';
import path                           from 'node:path';

import { getAdapter }                 from '@/adapters/adapter-factory.js';
import { parseStructuredOutput,
         parseStructuredOutputLenient } from '@/utils/structured-output.js';
import { withLLMRetry }               from '@/utils/retry.js';
import { gitCommit }                  from '@/utils/git.js';
import { getDb }                      from '@/db/migrate.js';
import { featureFlag }                from '@/config/feature-flags.js';
import { FactStore }                  from '@/memory/fact-store.js';
import { indexTranscriptFile }        from '@/memory/bm25.js';
import { hybridSearch }               from '@/memory/hybrid-search.js';
import { computeEmbeddingCached,
         serializeEmbedding }         from '@/memory/embeddings.js';
import {
  buildDreamSystemPrompt,
  buildDreamUserMessage,
  DreamOutputSchema,
  type DreamOutput,
} from '@/prompts/dream-agent.js';
import type { OrgConfig, ModelConfig, LLMProvider } from '@/types/index.js';

const MEMORY_ROOT         = process.env.AUTOORG_MEMORY_DIR ?? './memory';
const MEMORY_INDEX_PATH   = `${MEMORY_ROOT}/MEMORY.md`;
const FACTS_DIR           = `${MEMORY_ROOT}/facts`;
const TRANSCRIPTS_DIR     = `${MEMORY_ROOT}/transcripts`;
const MAX_MEMORY_LINES    = 150;
const DREAM_REPORTS_DIR   = './workspace/dream-reports';

export type DreamTrigger =
  | 'interval'
  | 'plateau'
  | 'budget_warning'
  | 'memory_critical'
  | 'manual';

export interface DreamResult {
  dreamRunId:              string;
  factsExtracted:          number;
  factsUpdated:            number;
  contradictionsFound:     number;
  contradictionsResolved:  number;
  patternsIdentified:      number;
  antiPatternsIdentified:  number;
  memoryIndexLinesBefore:  number;
  memoryIndexLinesAfter:   number;
  qualityScore:            number;
  costUsd:                 number;
  durationMs:              number;
  dreamReport:             string;
}

// ── Safe file reader ───────────────────────────────────────────────────
async function safeRead(filePath: string, maxChars = 4000): Promise<string> {
  if (!existsSync(filePath)) return `[File not found: ${filePath}]`;
  const content = await readFile(filePath, 'utf-8');
  return content.slice(0, maxChars) + (content.length > maxChars ? '\n\n[... truncated ...]' : '');
}

// ── Get dream model config ─────────────────────────────────────────────
function getDreamModelConfig(config: OrgConfig): ModelConfig {
  return config.modelAssignments.DreamAgent ?? {
    provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as LLMProvider,
    model:    'claude-sonnet-4-5',
  };
}

// ══════════════════════════════════════════════════════════════════════
// THE DREAM ENGINE
// ══════════════════════════════════════════════════════════════════════
export class DreamEngine {
  private runId:     string;
  private factStore: FactStore;

  constructor(runId: string) {
    this.runId     = runId;
    this.factStore = new FactStore(runId);
  }

  // ── Main entry point ───────────────────────────────────────────────
  async dream(
    config:      OrgConfig,
    cycleNumber: number,
    trigger:     DreamTrigger,
    scoreHistory: Array<{ cycle: number; score: number; decision: string }>
  ): Promise<DreamResult> {
    const dreamRunId  = `dream_${nanoid(8)}`;
    const startMs     = Date.now();

    console.log(chalk.bold.magenta(`\n  💤 autoDream — cycle ${cycleNumber} [${trigger}]`));
    console.log(chalk.magenta(`     Run ID: ${dreamRunId}`));

    // ── STEP 1: Record dream run start ─────────────────────────────
    const db = getDb();
    db.prepare(`
      INSERT INTO dream_runs
        (id, run_id, triggered_by, cycle_number, started_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(dreamRunId, this.runId, trigger, cycleNumber);
    db.close();

    // ── STEP 2: Index recent transcripts ───────────────────────────
    console.log(chalk.magenta('     Indexing transcripts...'));
    const { totalFiles, totalEntries } = await this.indexRecentTranscripts(cycleNumber);
    console.log(chalk.magenta(`     Indexed ${totalEntries} entries from ${totalFiles} files`));

    // ── STEP 3: Hybrid search for patterns ────────────────────────
    console.log(chalk.magenta('     Searching for patterns...'));
    const patternSearchResults = await this.searchForPatterns();
    const transcriptSummary    = this.buildTranscriptSummary(patternSearchResults);

    // ── STEP 4: Load current memory state ─────────────────────────
    const [
      currentMemoryIndex,
      currentFacts,
      currentFailures,
      currentValidated,
    ] = await Promise.all([
      safeRead(MEMORY_INDEX_PATH, 3000),
      safeRead(`${FACTS_DIR}/domain_knowledge.md`, 3000),
      safeRead(`${FACTS_DIR}/failed_experiments.md`, 3000),
      safeRead(`${FACTS_DIR}/validated_decisions.md`, 3000),
    ]);

    const memoryIndexLinesBefore = currentMemoryIndex.split('\n').length;

    // Get open objections as text
    const openObjRows = db.prepare(
      `SELECT severity, description FROM objections WHERE run_id=? AND resolved=0 LIMIT 10`
    ).all(this.runId) as Array<{ severity: string; description: string }>;
    const openObjections = openObjRows
      .map(o => `[${o.severity}] ${o.description}`)
      .join('\n') || '[None]';

    // ── STEP 5: Call DreamAgent LLM ────────────────────────────────
    console.log(chalk.magenta('     Calling DreamAgent LLM...'));
    const modelConfig = getDreamModelConfig(config);
    const adapter     = getAdapter(modelConfig);

    const systemPrompt  = buildDreamSystemPrompt();
    const userMessage   = buildDreamUserMessage({
      cycleNumber,
      dreamInterval:       config.dreamInterval,
      transcriptSummary,
      currentMemoryIndex,
      currentFacts,
      currentFailures,
      currentValidated,
      openObjections,
      scoreHistory:        scoreHistory.slice(-20),
      triggeredBy:         trigger,
    });

    let dreamOutput: DreamOutput;
    let costUsd = 0;
    let rawLlmOutput = '';

    try {
      const response = await withLLMRetry('DreamAgent', () =>
        adapter.run({
          model:       modelConfig.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userMessage  },
          ],
          maxTokens:   8192,
          temperature: 0.4, // Low temp — memory consolidation needs consistency
        })
      );

      rawLlmOutput = response.content;
      costUsd      = response.costUsd ?? 0;

      // ── STEP 6: Parse DreamAgent output ─────────────────────────
      const fallbackDream: DreamOutput = {
        validated_patterns: [],
        anti_patterns:      [],
        contradictions:     [],
        superseded_facts:   [],
        domain_knowledge:   [],
        new_memory_index:   currentMemoryIndex, // Keep current if parse fails
        dream_report:       'autoDream: LLM output could not be parsed. Memory unchanged.',
        quality_score:      0.1,
      };

      dreamOutput = parseStructuredOutputLenient(rawLlmOutput, DreamOutputSchema, fallbackDream);
      console.log(chalk.magenta(`     Dream quality: ${(dreamOutput.quality_score * 100).toFixed(0)}%`));

    } catch (err) {
      console.error(chalk.red(`     DreamAgent LLM failed: ${err}`));
      dreamOutput = {
        validated_patterns: [],
        anti_patterns:      [],
        contradictions:     [],
        superseded_facts:   [],
        domain_knowledge:   [],
        new_memory_index:   currentMemoryIndex,
        dream_report:       `autoDream failed: ${err}`,
        quality_score:      0,
      };
    }

    // ── STEP 7: Apply facts to fact store ──────────────────────────
    console.log(chalk.magenta('     Applying facts...'));
    let factsExtracted = 0;
    let factsUpdated   = 0;

    for (const p of dreamOutput.validated_patterns) {
      await this.factStore.addFact({
        statement:   p.statement,
        category:    p.category,
        sourceCycle: cycleNumber,
        sourceType:  'dream',
        evidence:    p.evidence,
        confidence:  p.confidence,
      });
      factsExtracted++;
    }

    for (const ap of dreamOutput.anti_patterns) {
      await this.factStore.addFact({
        statement:   ap.statement,
        category:    'anti_pattern',
        sourceCycle: cycleNumber,
        sourceType:  'dream',
        evidence:    ap.evidence,
        confidence:  ap.confidence,
      });
      factsExtracted++;
    }

    for (const dk of dreamOutput.domain_knowledge) {
      await this.factStore.addFact({
        statement:   dk.statement,
        category:    'domain_knowledge',
        sourceCycle: cycleNumber,
        sourceType:  'dream',
        evidence:    dk.source,
        confidence:  dk.confidence,
      });
      factsExtracted++;
    }

    // ── STEP 8: Resolve contradictions ────────────────────────────
    let contradictionsFound    = dreamOutput.contradictions.length;
    let contradictionsResolved = 0;

    for (const contra of dreamOutput.contradictions) {
      // Find matching facts in the store (by fuzzy statement match)
      const allFacts = this.factStore.getActiveFacts();
      const factA    = allFacts.find(f =>
        f.statement.toLowerCase().includes(contra.fact_a.toLowerCase().slice(0, 40))
      );
      const factB = allFacts.find(f =>
        f.statement.toLowerCase().includes(contra.fact_b.toLowerCase().slice(0, 40))
      );

      if (factA && factB) {
        const contraId = this.factStore.recordContradiction(
          factA, factB, `Dream detected: ${contra.fact_a} vs ${contra.fact_b}`, cycleNumber
        );

        const dropId = contra.keep === 'a' ? factB.id : factA.id;
        const keepId = contra.keep === 'a' ? factA.id : factB.id;

        if (contra.keep === 'merge' && contra.merged_fact) {
          // Add merged fact, deactivate both
          await this.factStore.addFact({
            statement:   contra.merged_fact,
            category:    factA.category,
            sourceCycle: cycleNumber,
            sourceType:  'dream_merge',
            evidence:    `Merged from cycles ${factA.sourceCycle} and ${factB.sourceCycle}`,
            confidence:  Math.max(factA.confidence, factB.confidence),
          });
          this.factStore.contradictFact(factA.id);
          this.factStore.contradictFact(factB.id);
        } else if (contra.keep !== 'neither') {
          this.factStore.resolveContradiction(
            contraId, contra.resolution, keepId, dropId, cycleNumber
          );
        }

        contradictionsResolved++;
      }
    }

    // ── STEP 9: Rewrite MEMORY.md ─────────────────────────────────
    console.log(chalk.magenta('     Rewriting MEMORY.md...'));
    const newMemoryContent = await this.buildNewMemoryIndex(
      dreamOutput, cycleNumber, config
    );

    await writeFile(MEMORY_INDEX_PATH, newMemoryContent, 'utf-8');
    const memoryIndexLinesAfter = newMemoryContent.split('\n').length;
    console.log(chalk.magenta(`     MEMORY.md: ${memoryIndexLinesBefore} → ${memoryIndexLinesAfter} lines`));

    // ── STEP 10: Update fact files (tier 2) ───────────────────────
    await this.updateFactFiles(dreamOutput, cycleNumber);

    // ── STEP 11: Snapshot memory state ────────────────────────────
    await this.snapshotMemory(dreamRunId, cycleNumber, newMemoryContent);

    // ── STEP 12: Write dream report ───────────────────────────────
    if (featureFlag('dreamReport')) {
      await this.writeDreamReport(dreamRunId, cycleNumber, dreamOutput.dream_report, dreamOutput);
    }

    // ── STEP 13: Git commit dream changes ─────────────────────────
    if (featureFlag('gitAuditTrail')) {
      try {
        await gitCommit(
          `autoorg-dream-cycle-${cycleNumber}: ` +
          `+${factsExtracted} facts, ${contradictionsResolved} contradictions resolved`
        );
      } catch {
        // Non-fatal — dream changes committed even if git fails
      }
    }

    // ── STEP 14: Update dream_runs record ─────────────────────────
    const durationMs = Date.now() - startMs;

    const db2 = getDb();
    db2.prepare(`
      UPDATE dream_runs SET
        transcripts_scanned   = ?,
        transcript_entries    = ?,
        facts_extracted       = ?,
        facts_updated         = ?,
        contradictions_found  = ?,
        contradictions_resolved = ?,
        patterns_identified   = ?,
        anti_patterns_identified = ?,
        memory_index_lines_before = ?,
        memory_index_lines_after  = ?,
        dream_quality_score   = ?,
        llm_cost_usd          = ?,
        duration_ms           = ?,
        dream_report          = ?,
        raw_llm_output        = ?,
        ended_at              = datetime('now')
      WHERE id = ?
    `).run(
      totalFiles, totalEntries,
      factsExtracted, factsUpdated,
      contradictionsFound, contradictionsResolved,
      dreamOutput.validated_patterns.length,
      dreamOutput.anti_patterns.length,
      memoryIndexLinesBefore, memoryIndexLinesAfter,
      dreamOutput.quality_score, costUsd, durationMs,
      dreamOutput.dream_report,
      rawLlmOutput.slice(0, 10000), // Cap raw output storage
      dreamRunId
    );
    db2.close();

    const result: DreamResult = {
      dreamRunId,
      factsExtracted,
      factsUpdated,
      contradictionsFound,
      contradictionsResolved,
      patternsIdentified:     dreamOutput.validated_patterns.length,
      antiPatternsIdentified: dreamOutput.anti_patterns.length,
      memoryIndexLinesBefore,
      memoryIndexLinesAfter,
      qualityScore:           dreamOutput.quality_score,
      costUsd,
      durationMs,
      dreamReport:            dreamOutput.dream_report,
    };

    console.log(chalk.bold.magenta(
      `     💤 Dream complete in ${(durationMs / 1000).toFixed(1)}s | ` +
      `${factsExtracted} facts | ${contradictionsResolved} contradictions resolved | ` +
      `$${costUsd.toFixed(5)}`
    ));

    return result;
  }

  // ── Index recent transcript files ─────────────────────────────────
  private async indexRecentTranscripts(
    currentCycle: number
  ): Promise<{ totalFiles: number; totalEntries: number }> {
    if (!existsSync(TRANSCRIPTS_DIR)) return { totalFiles: 0, totalEntries: 0 };

    const files        = readdirSync(TRANSCRIPTS_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .sort();

    let totalFiles   = 0;
    let totalEntries = 0;

    for (const file of files) {
      const cycleMatch = file.match(/cycle_(\d+)\.jsonl/);
      if (!cycleMatch) continue;

      const cycleNum = parseInt(cycleMatch[1]!);
      if (cycleNum > currentCycle) continue; // Don't index future cycles

      const filePath = path.join(TRANSCRIPTS_DIR, file);
      const indexed  = await indexTranscriptFile(filePath, this.runId);

      if (indexed > 0) {
        totalFiles++;
        totalEntries += indexed;
      }
    }

    // Now compute and store embeddings for un-embedded entries
    if (featureFlag('localEmbeddings')) {
      await this.computeTranscriptEmbeddings();
    }

    return { totalFiles, totalEntries };
  }

  // ── Compute embeddings for transcript entries that don't have them ─
  private async computeTranscriptEmbeddings(): Promise<void> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, content FROM transcript_index
      WHERE run_id = ? AND embedding IS NULL
      LIMIT 100
    `).all(this.runId) as Array<{ id: string; content: string }>;
    db.close();

    if (rows.length === 0) return;

    console.log(chalk.magenta(`     Computing ${rows.length} embeddings...`));

    for (const row of rows) {
      const vec    = await computeEmbeddingCached(row.content);
      const embBuf = serializeEmbedding(vec);

      const db2 = getDb();
      db2.prepare(
        `UPDATE transcript_index SET embedding = ? WHERE id = ?`
      ).run(embBuf, row.id);
      db2.close();
    }
  }

  // ── Hybrid search for patterns and failures ───────────────────────
  private async searchForPatterns(): Promise<Array<{
    role:    string;
    action:  string;
    content: string;
    cycle:   number;
    score:   number;
  }>> {
    const queries = [
      'score improved commit validated decision',
      'score decreased revert failed approach',
      'blocker objection critic unresolved',
      'groundedness claim unsupported evidence',
      'novelty repetition previous output',
      'devil advocate contrarian unexpected insight',
      'archivist warning repeated failure pattern',
    ];

    const allResults: Array<{ role: string; action: string; content: string; cycle: number; score: number }> = [];

    for (const query of queries) {
      const results = await hybridSearch(query, this.runId, {
        topK:    5,
        minScore: 0.1,
      });

      for (const r of results) {
        allResults.push({
          role:    r.role,
          action:  r.action,
          content: r.content,
          cycle:   r.cycle_number,
          score:   r.hybrid_score,
        });
      }
    }

    // Deduplicate by content and sort by score
    const seen    = new Set<string>();
    const unique  = allResults.filter(r => {
      const key = r.content.slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique.sort((a, b) => b.score - a.score).slice(0, 40);
  }

  // ── Build transcript summary from search results ──────────────────
  private buildTranscriptSummary(
    results: Array<{ role: string; action: string; content: string; cycle: number; score: number }>
  ): string {
    if (results.length === 0) return '[No relevant transcript entries found]';

    return results
      .slice(0, 30)
      .map(r => `[Cycle ${r.cycle}][${r.role}/${r.action}] ${r.content.slice(0, 150)}`)
      .join('\n');
  }

  // ── Build new MEMORY.md from dream output ─────────────────────────
  private async buildNewMemoryIndex(
    dreamOutput:  DreamOutput,
    cycleNumber:  number,
    config:       OrgConfig
  ): Promise<string> {
    // If DreamAgent produced a new memory index, use it (with line cap enforcement)
    if (dreamOutput.new_memory_index && dreamOutput.new_memory_index.length > 50) {
      const lines = dreamOutput.new_memory_index.split('\n');
      if (lines.length <= MAX_MEMORY_LINES) {
        return dreamOutput.new_memory_index;
      }
      // LLM exceeded line cap — enforce truncation with warning
      console.warn(chalk.yellow(
        `     ⚠  DreamAgent MEMORY.md exceeded ${MAX_MEMORY_LINES} lines (${lines.length}). Enforcing cap.`
      ));
      return lines.slice(0, MAX_MEMORY_LINES).join('\n') +
        '\n\n<!-- TRUNCATED: exceeded 150-line cap -->';
    }

    // Fallback: build MEMORY.md ourselves from fact store
    const factStats = this.factStore.getStats();
    const topFacts  = this.factStore.exportAsMarkdown(undefined, 0.5, 10);

    const db = getDb();
    const objRow = db.prepare(
      `SELECT COUNT(*) AS n FROM objections WHERE run_id=? AND resolved=0`
    ).get(this.runId) as { n: number };
    const dreamRow = db.prepare(
      `SELECT COUNT(*) AS n FROM dream_runs WHERE run_id=?`
    ).get(this.runId) as { n: number };
    db.close();

    const lines = [
      `# MEMORY.md — AutoOrg Memory Index (Tier 1)`,
      `# AUTO-REWRITTEN by DreamAgent at cycle ${cycleNumber}`,
      `# DO NOT EDIT MANUALLY — managed by autoDream`,
      `# Hard limit: 150 lines. Currently: [LINE_COUNT]/150`,
      ``,
      `## STATUS`,
      `Cycles completed: ${cycleNumber}`,
      `Best score: [UPDATE FROM RUN STATE]`,
      `Last dream consolidation: Cycle ${cycleNumber}`,
      `Total dream runs: ${dreamRow.n}`,
      `Total validated decisions: ${factStats.byCategory['validated_decision'] ?? 0}`,
      `Total failed experiments: ${factStats.byCategory['failed_approach'] ?? 0}`,
      `Total domain facts: ${factStats.byCategory['domain_knowledge'] ?? 0}`,
      `Open objections: ${objRow.n}`,
      ``,
      `## KNOWLEDGE BASE`,
      `Location: ./memory/facts/`,
      `Fact store: ./autoorg.db (facts table)`,
      `Active facts: ${factStats.active}`,
      `Avg confidence: ${(factStats.avgConfidence * 100).toFixed(0)}%`,
      ``,
      `## TOP PATTERNS (load memory/facts/domain_knowledge.md for full list)`,
      topFacts.split('\n').slice(0, 15).join('\n'),
      ``,
      `## VALIDATED DECISIONS`,
      `File: ./memory/facts/validated_decisions.md`,
      ``,
      `## FAILED EXPERIMENTS`,
      `File: ./memory/facts/failed_experiments.md`,
      ``,
      `## ACTIVE CONSTRAINTS`,
      ...config.constraints.slice(0, 5).map((c, i) => `${i + 1}. ${c}`),
      ``,
      `## TRANSCRIPT ARCHIVE`,
      `Location: ./memory/transcripts/`,
      `Index: autoorg.db (transcript_index, transcript_fts tables)`,
      `Search: hybridSearch(query, runId) — 0.7 vector + 0.3 BM25`,
      `DO NOT load full transcripts — search only.`,
    ];

    // Enforce line cap
    return lines.slice(0, MAX_MEMORY_LINES).join('\n');
  }

  // ── Update tier-2 fact files ──────────────────────────────────────
  private async updateFactFiles(
    dreamOutput:  DreamOutput,
    cycleNumber:  number
  ): Promise<void> {
    if (!existsSync(FACTS_DIR)) {
      await mkdir(FACTS_DIR, { recursive: true });
    }

    // Export fact store to markdown files
    const validatedFacts = this.factStore.exportAsMarkdown('validated_decision', 0.4, 20);
    const failedFacts    = this.factStore.exportAsMarkdown('failed_approach', 0.4, 20);
    const domainFacts    = this.factStore.exportAsMarkdown('domain_knowledge', 0.4, 20);
    const patternFacts   = this.factStore.exportAsMarkdown('pattern', 0.4, 15);
    const antiPatternFacts = this.factStore.exportAsMarkdown('anti_pattern', 0.4, 15);

    const ts = new Date().toISOString();

    await writeFile(`${FACTS_DIR}/validated_decisions.md`, [
      `# Validated Decisions — AutoOrg Fact Store`,
      `# Last updated: Cycle ${cycleNumber} (${ts})`,
      `# Managed by: DreamAgent + Archivist`,
      '',
      validatedFacts,
    ].join('\n'), 'utf-8');

    await writeFile(`${FACTS_DIR}/failed_experiments.md`, [
      `# Failed Experiments & Anti-Patterns — AutoOrg Fact Store`,
      `# Last updated: Cycle ${cycleNumber} (${ts})`,
      `# Managed by: DreamAgent + Archivist`,
      '',
      failedFacts,
      '',
      antiPatternFacts,
    ].join('\n'), 'utf-8');

    await writeFile(`${FACTS_DIR}/domain_knowledge.md`, [
      `# Domain Knowledge — AutoOrg Fact Store`,
      `# Last updated: Cycle ${cycleNumber} (${ts})`,
      `# Managed by: DreamAgent`,
      '',
      domainFacts,
      '',
      `## PATTERNS`,
      patternFacts,
    ].join('\n'), 'utf-8');
  }

  // ── Snapshot memory state ─────────────────────────────────────────
  private async snapshotMemory(
    dreamRunId:    string,
    cycleNumber:   number,
    memoryContent: string
  ): Promise<void> {
    const db      = getDb();
    const hash    = createHash('sha256').update(memoryContent).digest('hex');
    const lineCount = memoryContent.split('\n').length;

    db.prepare(`
      INSERT OR IGNORE INTO memory_snapshots_v2
        (id, run_id, dream_run_id, cycle_number, tier, file_path, content, content_hash, line_count)
      VALUES (?, ?, ?, ?, 1, 'MEMORY.md', ?, ?, ?)
    `).run(
      `snap_${nanoid(8)}`, this.runId, dreamRunId,
      cycleNumber, memoryContent, hash, lineCount
    );
    db.close();
  }

  // ── Write dream report to workspace ──────────────────────────────
  private async writeDreamReport(
    dreamRunId:   string,
    cycleNumber:  number,
    report:       string,
    fullOutput:   DreamOutput
  ): Promise<void> {
    if (!existsSync(DREAM_REPORTS_DIR)) {
      await mkdir(DREAM_REPORTS_DIR, { recursive: true });
    }

    const filePath = `${DREAM_REPORTS_DIR}/dream_cycle_${String(cycleNumber).padStart(4,'0')}.md`;

    const content = [
      `# AutoOrg Dream Report — Cycle ${cycleNumber}`,
      `Generated: ${new Date().toISOString()}`,
      `Dream Run ID: ${dreamRunId}`,
      `Quality Score: ${(fullOutput.quality_score * 100).toFixed(0)}%`,
      '',
      `## Summary`,
      report,
      '',
      `## Validated Patterns (${fullOutput.validated_patterns.length})`,
      ...fullOutput.validated_patterns.map(p =>
        `- [${(p.confidence * 100).toFixed(0)}%] ${p.statement}`
      ),
      '',
      `## Anti-Patterns Detected (${fullOutput.anti_patterns.length})`,
      ...fullOutput.anti_patterns.map(ap =>
        `- [${ap.severity.toUpperCase()}] ${ap.statement}`
      ),
      '',
      `## Contradictions Resolved (${fullOutput.contradictions.length})`,
      ...fullOutput.contradictions.map(c =>
        `- ${c.fact_a} ↔ ${c.fact_b} → ${c.resolution}`
      ),
    ].join('\n');

    await writeFile(filePath, content, 'utf-8');
    console.log(chalk.magenta(`     Dream report: ${filePath}`));
  }
}

// ── Dream trigger evaluation ───────────────────────────────────────────
export function shouldTriggerDream(
  cycleNumber:        number,
  dreamInterval:      number,
  plateauCount:       number,
  plateauThreshold:   number,
  memoryHealth:       { critical: string[] },
  lastDreamCycle:     number | null
): { shouldDream: boolean; trigger: DreamTrigger } {

  // Interval-based trigger (every N cycles)
  if (cycleNumber % dreamInterval === 0) {
    return { shouldDream: true, trigger: 'interval' };
  }

  // Plateau trigger (score stuck)
  if (
    featureFlag('dreamOnPlateau') &&
    plateauCount >= Math.floor(plateauThreshold * 0.6) &&
    (lastDreamCycle === null || cycleNumber - lastDreamCycle >= 3)
  ) {
    return { shouldDream: true, trigger: 'plateau' };
  }

  // Memory critical trigger
  if (
    featureFlag('memoryHealthMonitor') &&
    memoryHealth.critical.length > 0 &&
    (lastDreamCycle === null || cycleNumber - lastDreamCycle >= 3)
  ) {
    return { shouldDream: true, trigger: 'memory_critical' };
  }

  return { shouldDream: false, trigger: 'interval' };
}
