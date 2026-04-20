/**
 * AutoOrg — Fact Store
 *
 * Manages the structured fact database (tier-2 memory).
 * Facts are the distilled output of the DreamAgent.
 *
 * Fact lifecycle:
 *   1. DreamAgent observes pattern in transcripts
 *   2. DreamAgent converts to absolute fact statement
 *   3. Fact stored with confidence score
 *   4. Subsequent dreams confirm or contradict the fact
 *   5. Confidence rises with confirmation, falls with contradiction
 *   6. Low-confidence facts are marked inactive
 *   7. Contradicted facts are superseded by newer facts
 *
 * Claude Code KAIROS leak:
 *   "The autoDream logic merges disparate observations, removes logical
 *    contradictions, and converts vague insights into absolute facts."
 */

import { nanoid }                    from 'nanoid';
import { createHash }                from 'node:crypto';
import { getDb }                     from '@/db/migrate.js';
import { computeEmbeddingCached,
         serializeEmbedding }        from './embeddings.js';
import type { FeatureFlag }          from '@/types/index.js';

export type FactCategory =
  | 'validated_decision'
  | 'failed_approach'
  | 'domain_knowledge'
  | 'pattern'
  | 'anti_pattern'
  | 'constraint'
  | 'agent_behavior';

export interface Fact {
  id:                 string;
  runId:              string;
  statement:          string;
  category:           FactCategory;
  sourceCycle:        number;
  sourceType:         string;
  evidence:           string;
  confidence:         number;
  confirmationCount:  number;
  contradictionCount: number;
  active:             boolean;
  supersededBy:       string | null;
  lastConfirmed:      number | null;
}

export interface FactInput {
  statement:   string;
  category:    FactCategory;
  sourceCycle: number;
  sourceType:  string;
  evidence?:   string;
  confidence?: number;
}

// ── Convert raw DB row to Fact ─────────────────────────────────────────
function rowToFact(row: Record<string, unknown>): Fact {
  return {
    id:                 row.id as string,
    runId:              row.run_id as string,
    statement:          row.statement as string,
    category:           row.category as FactCategory,
    sourceCycle:        row.source_cycle as number,
    sourceType:         row.source_type as string,
    evidence:           row.evidence as string ?? '',
    confidence:         row.confidence as number,
    confirmationCount:  row.confirmation_count as number,
    contradictionCount: row.contradiction_count as number,
    active:             (row.active as number) === 1,
    supersededBy:       row.superseded_by as string | null,
    lastConfirmed:      row.last_confirmed as number | null,
  };
}

export class FactStore {
  private runId: string;

  constructor(runId: string) {
    this.runId = runId;
  }

  // ── Add a new fact ────────────────────────────────────────────────
  async addFact(input: FactInput): Promise<Fact> {
    const factId   = `fact_${nanoid(8)}`;
    const confidence = input.confidence ?? 0.5;

    // Compute embedding for semantic dedup
    const embedding = await computeEmbeddingCached(input.statement);
    const embBuf    = serializeEmbedding(embedding);

    const db = getDb();
    db.prepare(`
      INSERT INTO facts
        (id, run_id, statement, category, source_cycle, source_type,
         evidence, confidence, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      factId, this.runId, input.statement, input.category,
      input.sourceCycle, input.sourceType,
      input.evidence ?? '', confidence, embBuf
    );
    db.close();

    return {
      id:                 factId,
      runId:              this.runId,
      statement:          input.statement,
      category:           input.category,
      sourceCycle:        input.sourceCycle,
      sourceType:         input.sourceType,
      evidence:           input.evidence ?? '',
      confidence,
      confirmationCount:  1,
      contradictionCount: 0,
      active:             true,
      supersededBy:       null,
      lastConfirmed:      null,
    };
  }

  // ── Get all active facts for a category ───────────────────────────
  getActiveFacts(category?: FactCategory): Fact[] {
    const db = getDb();
    const rows = category
      ? db.prepare(
          `SELECT * FROM facts WHERE run_id=? AND active=1 AND category=? ORDER BY confidence DESC`
        ).all(this.runId, category)
      : db.prepare(
          `SELECT * FROM facts WHERE run_id=? AND active=1 ORDER BY confidence DESC`
        ).all(this.runId);
    db.close();
    return (rows as Record<string, unknown>[]).map(rowToFact);
  }

  // ── Confirm a fact (raises confidence) ────────────────────────────
  confirmFact(factId: string, cycleNumber: number): void {
    const db = getDb();
    db.prepare(`
      UPDATE facts
      SET confirmation_count = confirmation_count + 1,
          confidence         = MIN(1.0, confidence + 0.08),
          last_confirmed     = ?,
          updated_at         = datetime('now')
      WHERE id = ? AND run_id = ?
    `).run(cycleNumber, factId, this.runId);
    db.close();
  }

  // ── Contradict a fact (lowers confidence, may deactivate) ─────────
  contradictFact(factId: string, newFactId?: string): void {
    const db = getDb();

    db.prepare(`
      UPDATE facts
      SET contradiction_count = contradiction_count + 1,
          confidence          = MAX(0.0, confidence - 0.15),
          updated_at          = datetime('now')
      WHERE id = ? AND run_id = ?
    `).run(factId, this.runId);

    // Check if confidence dropped too low
    const row = db.prepare(
      `SELECT confidence FROM facts WHERE id = ?`
    ).get(factId) as { confidence: number } | undefined;

    if (row && row.confidence < 0.2) {
      db.prepare(`
        UPDATE facts
        SET active       = 0,
            superseded_by = ?,
            updated_at    = datetime('now')
        WHERE id = ?
      `).run(newFactId ?? null, factId);
    }

    db.close();
  }

  // ── Detect contradictions between facts ───────────────────────────
  async detectContradictions(cycleNumber: number): Promise<Array<{
    factA: Fact;
    factB: Fact;
    description: string;
  }>> {
    const facts = this.getActiveFacts();
    if (facts.length < 2) return [];

    const contradictions: Array<{ factA: Fact; factB: Fact; description: string }> = [];

    // Simple heuristic: negation detection
    // Facts that contain "NOT X" contradict facts that assert "X"
    const negationPatterns = [
      /\bnot\b/i, /\bnever\b/i, /\bfails\b/i, /\bineffective\b/i,
      /\bdoes not\b/i, /\bdoesn't\b/i, /\bworsen\b/i, /\bworse\b/i,
    ];

    for (let i = 0; i < facts.length; i++) {
      for (let j = i + 1; j < facts.length; j++) {
        const a = facts[i]!;
        const b = facts[j]!;

        // Skip same-category comparison for some categories
        if (a.category === 'domain_knowledge' && b.category === 'domain_knowledge') continue;

        const aHasNegation = negationPatterns.some(p => p.test(a.statement));
        const bHasNegation = negationPatterns.some(p => p.test(b.statement));

        if (aHasNegation !== bHasNegation) {
          // Check if they're about the same thing using keyword overlap
          const aWords = new Set(a.statement.toLowerCase().split(/\s+/).filter(w => w.length > 4));
          const bWords = new Set(b.statement.toLowerCase().split(/\s+/).filter(w => w.length > 4));
          const overlap = [...aWords].filter(w => bWords.has(w)).length;
          const overlapRatio = overlap / Math.min(aWords.size, bWords.size);

          if (overlapRatio > 0.4) {
            // Possible contradiction detected
            const existing = getDb().prepare(`
              SELECT 1 FROM contradictions
              WHERE run_id=? AND ((fact_a_id=? AND fact_b_id=?) OR (fact_a_id=? AND fact_b_id=?))
              AND resolved=0
            `).get(this.runId, a.id, b.id, b.id, a.id);
            getDb().close();

            if (!existing) {
              contradictions.push({
                factA: a,
                factB: b,
                description: `"${a.statement.slice(0, 80)}" may contradict "${b.statement.slice(0, 80)}"`,
              });
            }
          }
        }
      }
    }

    return contradictions;
  }

  // ── Record a contradiction in DB ──────────────────────────────────
  recordContradiction(
    factA:         Fact,
    factB:         Fact,
    description:   string,
    cycleNumber:   number
  ): string {
    const contraId = `contra_${nanoid(8)}`;
    const db       = getDb();
    db.prepare(`
      INSERT OR IGNORE INTO contradictions
        (id, run_id, fact_a_id, fact_b_id, description, detected_cycle)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(contraId, this.runId, factA.id, factB.id, description, cycleNumber);
    db.close();
    return contraId;
  }

  // ── Resolve a contradiction ────────────────────────────────────────
  resolveContradiction(
    contraId:     string,
    resolution:   string,
    keepFactId:   string,
    dropFactId:   string,
    cycleNumber:  number
  ): void {
    const db = getDb();
    db.prepare(`
      UPDATE contradictions
      SET resolved=1, resolution=?, resolved_cycle=?
      WHERE id=?
    `).run(resolution, cycleNumber, contraId);
    db.close();

    this.contradictFact(dropFactId);
  }

  // ── Export facts as markdown for MEMORY.md / context ──────────────
  exportAsMarkdown(
    category?:       FactCategory,
    minConfidence:   number = 0.4,
    maxFacts:        number = 30
  ): string {
    const facts = this.getActiveFacts(category)
      .filter(f => f.confidence >= minConfidence)
      .slice(0, maxFacts);

    if (facts.length === 0) return '[No facts yet]';

    const grouped = new Map<string, Fact[]>();
    for (const f of facts) {
      const list = grouped.get(f.category) ?? [];
      list.push(f);
      grouped.set(f.category, list);
    }

    const lines: string[] = [];
    for (const [cat, catFacts] of grouped.entries()) {
      lines.push(`\n### ${cat.replace(/_/g, ' ').toUpperCase()}`);
      for (const f of catFacts) {
        const conf = `[${(f.confidence * 100).toFixed(0)}%]`;
        lines.push(`- ${conf} ${f.statement}`);
        if (f.evidence) lines.push(`  *Evidence (Cycle ${f.sourceCycle}): ${f.evidence.slice(0, 80)}*`);
      }
    }

    return lines.join('\n');
  }

  // ── Get statistics ─────────────────────────────────────────────────
  getStats(): {
    total: number;
    active: number;
    byCategory: Record<string, number>;
    avgConfidence: number;
    contradictions: number;
  } {
    const db   = getDb();
    const rows = db.prepare(`SELECT * FROM v_fact_summary WHERE run_id = ?`).all(this.runId) as Array<{
      category: string; total: number; active_count: number; avg_confidence: number;
    }>;

    const contrRow = db.prepare(
      `SELECT COUNT(*) AS n FROM contradictions WHERE run_id=? AND resolved=0`
    ).get(this.runId) as { n: number };
    db.close();

    const byCategory: Record<string, number> = {};
    let   totalActive  = 0;
    let   totalFacts   = 0;
    let   sumConfidence = 0;

    for (const r of rows) {
      byCategory[r.category] = r.active_count;
      totalActive  += r.active_count;
      totalFacts   += r.total;
      sumConfidence += (r.avg_confidence ?? 0) * r.active_count;
    }

    return {
      total:          totalFacts,
      active:         totalActive,
      byCategory,
      avgConfidence:  totalActive > 0 ? sumConfidence / totalActive : 0,
      contradictions: contrRow.n,
    };
  }
}
