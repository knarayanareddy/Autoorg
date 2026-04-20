/**
 * AutoOrg — Hybrid Search Engine
 *
 * Combines vector similarity (semantic) + BM25 (keyword) search.
 * Ratio: 0.7 × cosine + 0.3 × BM25
 *
 * This is the exact ratio used by MiroFish-Offline's local search.
 * It gives semantic breadth (finds related concepts) while
 * BM25 ensures exact keyword matches aren't missed.
 *
 * Usage:
 *   const results = await hybridSearch("groundedness failures", runId);
 *   // Returns top-K transcript entries most relevant to the query
 */

import { computeEmbeddingCached, cosineSimilarity, deserializeEmbedding } from './embeddings.js';
import { searchBM25 }    from './bm25.js';
import { getDb }         from '@/db/migrate.js';

export interface HybridSearchResult {
  id:            string;
  run_id:        string;
  cycle_number:  number;
  role:          string;
  action:        string;
  content:       string;
  vector_score:  number;
  bm25_score:    number;
  hybrid_score:  number;
}

export interface HybridSearchOptions {
  vectorWeight?: number;  // default 0.7
  bm25Weight?:   number;  // default 0.3
  topK?:         number;  // default 10
  minScore?:     number;  // default 0.1
  roleFilter?:   string;  // filter to specific agent role
}

// ── Hybrid search ─────────────────────────────────────────────────────
export async function hybridSearch(
  query:   string,
  runId:   string,
  opts:    HybridSearchOptions = {}
): Promise<HybridSearchResult[]> {
  const vectorWeight = opts.vectorWeight ?? 0.7;
  const bm25Weight   = opts.bm25Weight   ?? 0.3;
  const topK         = opts.topK         ?? 10;
  const minScore     = opts.minScore     ?? 0.05;

  // ── Run both searches in parallel ──────────────────────────────────
  const [queryEmbedding, bm25Results] = await Promise.all([
    computeEmbeddingCached(query),
    searchBM25(query, runId, topK * 3),
  ]);

  // ── Vector search: load embeddings from DB ─────────────────────────
  const db         = getDb();
  const conditions = opts.roleFilter
    ? `WHERE run_id = ? AND role = ? AND embedding IS NOT NULL`
    : `WHERE run_id = ? AND embedding IS NOT NULL`;
  const params     = opts.roleFilter ? [runId, opts.roleFilter] : [runId];

  const vectorCandidates = db.prepare(`
    SELECT id, run_id, cycle_number, role, action, content, embedding
    FROM transcript_index
    ${conditions}
    ORDER BY cycle_number DESC
    LIMIT ?
  `).all(...params, topK * 5) as Array<{
    id: string; run_id: string; cycle_number: number;
    role: string; action: string; content: string;
    embedding: Buffer | null;
  }>;
  db.close();

  // ── Score vector candidates ────────────────────────────────────────
  const vectorScores = new Map<string, number>();
  for (const candidate of vectorCandidates) {
    if (!candidate.embedding) continue;
    const vec   = deserializeEmbedding(candidate.embedding);
    const score = cosineSimilarity(queryEmbedding, vec);
    vectorScores.set(candidate.id, score);
  }

  // ── Score BM25 candidates (normalize to [0,1]) ─────────────────────
  const bm25Scores = new Map<string, number>();
  if (bm25Results.length > 0) {
    const maxBm25 = Math.max(...bm25Results.map(r => r.bm25_score), 1);
    for (const result of bm25Results) {
      bm25Scores.set(result.id, result.bm25_score / maxBm25);
    }
  }

  // ── Merge and score all candidates ────────────────────────────────
  const allIds = new Set([
    ...vectorScores.keys(),
    ...bm25Scores.keys(),
  ]);

  const allCandidates = new Map<string, Omit<HybridSearchResult, 'hybrid_score' | 'vector_score' | 'bm25_score'>>();

  // Fill from vector candidates
  for (const c of vectorCandidates) {
    allCandidates.set(c.id, {
      id:           c.id,
      run_id:       c.run_id,
      cycle_number: c.cycle_number,
      role:         c.role,
      action:       c.action,
      content:      c.content,
    });
  }

  // Fill from BM25 candidates
  for (const r of bm25Results) {
    if (!allCandidates.has(r.id)) {
      allCandidates.set(r.id, {
        id:           r.id,
        run_id:       r.run_id,
        cycle_number: r.cycle_number,
        role:         r.role,
        action:       r.action,
        content:      r.content,
      });
    }
  }

  // ── Compute hybrid scores ─────────────────────────────────────────
  const results: HybridSearchResult[] = [];

  for (const id of allIds) {
    const candidate = allCandidates.get(id);
    if (!candidate) continue;

    const vScore = vectorScores.get(id) ?? 0;
    const bScore = bm25Scores.get(id)   ?? 0;
    const hybrid = vectorWeight * vScore + bm25Weight * bScore;

    if (hybrid >= minScore) {
      results.push({
        ...candidate,
        vector_score: vScore,
        bm25_score:   bScore,
        hybrid_score: hybrid,
      });
    }
  }

  // Sort by hybrid score and return top-K
  return results
    .sort((a, b) => b.hybrid_score - a.hybrid_score)
    .slice(0, topK);
}

// ── Search facts ───────────────────────────────────────────────────────
export async function searchFacts(
  query:    string,
  runId:    string,
  category?: string,
  topK:     number = 10
): Promise<Array<{
  id:         string;
  statement:  string;
  category:   string;
  confidence: number;
  score:      number;
}>> {
  const queryEmbedding = await computeEmbeddingCached(query);

  const db = getDb();
  const conditions = category
    ? `WHERE run_id = ? AND active = 1 AND category = ?`
    : `WHERE run_id = ? AND active = 1`;
  const params = category ? [runId, category] : [runId];

  const facts = db.prepare(`
    SELECT id, statement, category, confidence, embedding
    FROM facts
    ${conditions}
    ORDER BY confidence DESC
    LIMIT ?
  `).all(...params, topK * 3) as Array<{
    id: string; statement: string; category: string;
    confidence: number; embedding: Buffer | null;
  }>;
  db.close();

  const scored = facts
    .map(f => ({
      id:         f.id,
      statement:  f.statement,
      category:   f.category,
      confidence: f.confidence,
      score: f.embedding
        ? cosineSimilarity(queryEmbedding, deserializeEmbedding(f.embedding)) * f.confidence
        : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}
