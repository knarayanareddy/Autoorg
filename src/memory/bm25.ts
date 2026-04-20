/**
 * AutoOrg — BM25 Full-Text Search
 *
 * Uses SQLite's built-in FTS5 (which implements BM25 ranking)
 * for keyword search over the transcript index.
 *
 * The hybrid search combines this with vector similarity:
 *   final_score = 0.7 × cosine_similarity + 0.3 × bm25_score
 *
 * This mirrors the MiroFish-Offline hybrid search ratio exactly.
 */

import { getDb } from '@/db/migrate.js';

export interface BM25Result {
  id:           string;
  run_id:       string;
  cycle_number: number;
  role:         string;
  action:       string;
  content:      string;
  bm25_score:   number;
}

// ── Index new transcript entries ───────────────────────────────────────
export async function indexTranscriptEntry(
  id:          string,
  runId:       string,
  cycleNumber: number,
  role:        string,
  action:      string,
  content:     string,
  contentHash: string
): Promise<void> {
  const db = getDb();

  // Check for duplicate
  const exists = db.prepare(
    `SELECT 1 FROM transcript_index WHERE content_hash = ? AND run_id = ?`
  ).get(contentHash, runId);

  if (!exists) {
    db.prepare(`
      INSERT INTO transcript_index
        (id, run_id, cycle_number, role, action, content, content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, runId, cycleNumber, role, action, content, contentHash);
  }

  db.close();
}

// ── BM25 search via SQLite FTS5 ────────────────────────────────────────
export function searchBM25(
  query:  string,
  runId:  string,
  limit:  number = 20
): BM25Result[] {
  const db = getDb();

  // FTS5 bm25() function returns negative scores (more negative = better)
  const rows = db.prepare(`
    SELECT
      ti.id,
      ti.run_id,
      ti.cycle_number,
      ti.role,
      ti.action,
      ti.content,
      -bm25(transcript_fts) AS bm25_score
    FROM transcript_fts
    JOIN transcript_index ti ON ti.rowid = transcript_fts.rowid
    WHERE transcript_fts MATCH ?
      AND ti.run_id = ?
    ORDER BY bm25_score DESC
    LIMIT ?
  `).all(query, runId, limit) as BM25Result[];

  db.close();
  return rows;
}

// ── Index a batch of transcript entries from a JSONL file ────────────
export async function indexTranscriptFile(
  filePath: string,
  runId:    string
): Promise<number> {
  const { readFile } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const { nanoid }    = await import('nanoid');

  if (!existsSync(filePath)) return 0;

  const raw     = await readFile(filePath, 'utf-8');
  const lines   = raw.trim().split('\n').filter(Boolean);
  let   indexed = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as {
        cycle:   number;
        role:    string;
        action:  string;
        content: string;
      };

      const contentHash = createHash('sha256')
        .update(`${entry.cycle}:${entry.role}:${entry.content}`)
        .digest('hex');

      await indexTranscriptEntry(
        `tidx_${nanoid(8)}`,
        runId,
        entry.cycle,
        entry.role,
        entry.action,
        entry.content,
        contentHash
      );
      indexed++;
    } catch {
      // Skip malformed lines
    }
  }

  return indexed;
}
